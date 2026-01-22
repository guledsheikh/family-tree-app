// src/FamilyTree.tsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { firebase, type FirebasePersonDoc } from "./firebaseClient";

/// ----- Types -----
export interface Person {
  id: string;
  name: string;
  children?: Person[];
  _collapsed?: boolean;
}

// ----- Debug Component -----
interface DebugInfoProps {
  firebaseConfig: {
    apiKey: string;
    projectId: string;
  };
  environment: string;
  firebaseStatus: string;
  error: string | null;
}

const DebugInfo: React.FC<DebugInfoProps> = ({
  firebaseConfig,
  environment,
  firebaseStatus,
  error,
}) => {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "10px",
        right: "10px",
        background: "rgba(0,0,0,0.8)",
        color: "white",
        padding: "10px",
        fontSize: "12px",
        zIndex: 9999,
        maxWidth: "300px",
        borderRadius: "5px",
        fontFamily: "monospace",
      }}
    >
      <h4 style={{ margin: "0 0 10px 0" }}>Debug Information</h4>
      <p>Environment: {environment}</p>
      <p>
        Firebase Status:{" "}
        <span
          style={{
            color:
              firebaseStatus === "connected"
                ? "#4caf50"
                : firebaseStatus === "error"
                ? "#e74c3c"
                : "#f39c12",
          }}
        >
          {firebaseStatus}
        </span>
      </p>
      <p>Firebase API Key: {firebaseConfig.apiKey ? "Set" : "Not set"}</p>
      <p>Firebase Project ID: {firebaseConfig.projectId ? "Set" : "Not set"}</p>
      {error && <p style={{ color: "#e74c3c" }}>Error: {error}</p>}
      <p>Build Date: {new Date().toISOString()}</p>
    </div>
  );
};

// ----- Sample Data with Ancestors -----
const initialData: Person = {
  id: "1",
  name: "Great-Great-Grandparent",
  children: [
    {
      id: "2",
      name: "Great-Grandparent",
      children: [
        {
          id: "3",
          name: "Grandparent",
          children: [
            {
              id: "4",
              name: "Parent 1",
              children: [
                { id: "5", name: "Child 1.1" },
                { id: "6", name: "Child 1.2" },
              ],
            },
            {
              id: "7",
              name: "Parent 2",
              children: [{ id: "8", name: "Child 2.1" }],
            },
          ],
        },
      ],
    },
  ],
};

// ----- Utils -----
const genId = () => Math.random().toString(36).slice(2, 10);

const countChildren = (p: Person): number => p.children?.length ?? 0;

const mapTree = (p: Person, fn: (n: Person) => Person): Person => {
  const next = fn(p);
  return {
    ...next,
    children: next.children?.map((c) => mapTree(c, fn)),
  };
};

const updateTree = (
  p: Person,
  fn: (n: Person) => Person | null
): Person | null => {
  const res = fn(p);
  if (!res) return null;
  return {
    ...res,
    children: res.children
      ?.map((c) => updateTree(c, fn))
      .filter((x): x is Person => x !== null),
  };
};

// Find a node by ID
const findNode = (node: Person, id: string): Person | null => {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
};

// Get the path from root to a node
const getPathToNode = (node: Person, id: string): Person[] => {
  if (node.id === id) return [node];
  if (node.children) {
    for (const child of node.children) {
      const path = getPathToNode(child, id);
      if (path.length > 0) return [node, ...path];
    }
  }
  return [];
};

// Convert tree structure to flat array for Firebase
const flattenTree = (
  node: Person,
  parentId: string | null = null
): FirebasePersonDoc[] => {
  const flattened: FirebasePersonDoc[] = [
    {
      id: node.id,
      name: node.name,
      parent_id: parentId,
      children: node.children ? node.children.map((child) => child.id) : [],
      collapsed: node._collapsed || false,
    },
  ];

  if (node.children) {
    for (const child of node.children) {
      flattened.push(...flattenTree(child, node.id));
    }
  }

  return flattened;
};

// Convert flat array back to tree structure
const buildTree = (flatData: FirebasePersonDoc[]): Person | null => {
  if (flatData.length === 0) return null;

  // Create a map for quick lookup
  const nodeMap = new Map<string, Person>();

  // First pass: create all nodes without children
  flatData.forEach((item) => {
    nodeMap.set(item.id, {
      id: item.id,
      name: item.name,
      _collapsed: item.collapsed || false,
      children: [],
    });
  });

  // Second pass: build the hierarchy
  flatData.forEach((item) => {
    const node = nodeMap.get(item.id);
    if (node && item.children) {
      node.children = item.children
        .map((childId: string) => nodeMap.get(childId))
        .filter((child): child is Person => child !== undefined);
    }
  });

  // Find the root (node with no parent)
  const rootItem = flatData.find((item) => item.parent_id === null);
  return rootItem ? nodeMap.get(rootItem.id) || null : null;
};

// Recursive delete function for Firebase
const deleteNodeAndChildren = async (nodeId: string) => {
  try {
    // First get the node to find its children
    const node = await firebase.getById(nodeId);

    if (!node) return;

    // Recursively delete all children
    if (node.children && node.children.length > 0) {
      for (const childId of node.children) {
        await deleteNodeAndChildren(childId);
      }
    }

    // Finally delete this node
    await firebase.delete(nodeId);
  } catch (error) {
    console.error("Error in deleteNodeAndChildren:", error);
    throw error;
  }
};

type FamilyTreeProps = {
  isAdmin: boolean;
};

// ----- Component -----
const FamilyTree: React.FC<FamilyTreeProps> = ({ isAdmin }) => {
  const [data, setData] = useState<Person>(initialData);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [viewRootId, setViewRootId] = useState<string>("3");
  const [loading, setLoading] = useState<boolean>(true);
  const [firebaseStatus, setFirebaseStatus] = useState<
    "checking" | "connected" | "error"
  >("checking");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const contextMenuRef = useRef<HTMLUListElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debug keyboard shortcut
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "d") {
        setShowDebug((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);

  // Check if Firebase is properly configured
  useEffect(() => {
    const checkFirebaseConfig = () => {
      const firebaseApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
      const firebaseProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

      if (!firebaseApiKey || !firebaseProjectId) {
        setFirebaseStatus("error");
        setLoadError(
          "Firebase environment variables are not configured. Please check your .env file and Vercel settings."
        );
        setLoading(false);
        return false;
      }

      return true;
    };

    if (!checkFirebaseConfig()) {
      return;
    }
  }, []);

  // Load data from Firebase
  const loadDataFromFirebase = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      setFirebaseStatus("checking");

      console.log("Loading data from Firebase...");

      // Test Firebase connection
      const testData = await firebase.getAll();
      console.log("Firebase connection test:", testData);

      setFirebaseStatus("connected");

      // Load actual data
      const firebaseData = await firebase.getAll();
      console.log("Firebase response:", firebaseData);

      if (firebaseData && firebaseData.length > 0) {
        console.log("Data loaded successfully:", firebaseData);
        // Cast to FirebasePersonDoc[] if needed
        const treeData = buildTree(firebaseData as FirebasePersonDoc[]);
        if (treeData) {
          setData(treeData);
        }
      } else {
        // If no data exists, initialize with sample data
        console.log("No data found, initializing...");
        await initializeFirebaseData();
      }
    } catch (error) {
      console.error("Error loading data:", error);
      setFirebaseStatus("error");
      setLoadError(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize Firebase with sample data
  const initializeFirebaseData = useCallback(async () => {
    try {
      console.log("Initializing Firebase with sample data...");

      const flatData = flattenTree(initialData);

      // Save each document to Firebase
      for (const person of flatData) {
        await firebase.upsert(person.id, {
          name: person.name,
          parent_id: person.parent_id,
          children: person.children,
          collapsed: person.collapsed,
        });
      }

      console.log("Firebase initialized successfully");
      // Reload data after initialization
      await loadDataFromFirebase();
    } catch (error) {
      console.error("Error initializing data:", error);
      setLoadError(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    }
  }, [loadDataFromFirebase]);

  // Save data to Firebase
  const saveDataToFirebase = useCallback(async () => {
    try {
      const flatData = flattenTree(data);

      // Save each person to Firebase
      for (const person of flatData) {
        await firebase.upsert(person.id, {
          name: person.name,
          parent_id: person.parent_id,
          children: person.children,
          collapsed: person.collapsed,
        });
      }

      console.log("Data saved successfully to Firebase");
      return true;
    } catch (error) {
      console.error("Error saving data to Firebase:", error);
      return false;
    }
  }, [data]);

  // Load data from Firebase on component mount
  useEffect(() => {
    const firebaseApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
    const firebaseProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

    if (firebaseApiKey && firebaseProjectId) {
      loadDataFromFirebase();
    } else {
      setLoading(false);
    }
  }, [loadDataFromFirebase]);

  // Save data to Firebase with debounce
  useEffect(() => {
    if (!loading && firebaseStatus === "connected") {
      // Clear any existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set a new timeout to save after 1 second of inactivity
      saveTimeoutRef.current = setTimeout(() => {
        saveDataToFirebase();
      }, 1000);
    }

    // Cleanup function
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [data, loading, saveDataToFirebase, firebaseStatus]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(event.target as Node)
      ) {
        setMenu(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Get current view root node
  const viewRoot = findNode(data, viewRootId) || initialData;

  // Get ancestor path for breadcrumb
  const ancestorPath = getPathToNode(data, viewRootId);

  // Actions
  const toggleCollapse = useCallback((id: string) => {
    setData((prev) =>
      mapTree(prev, (n) =>
        n.id === id ? { ...n, _collapsed: !(n._collapsed ?? false) } : n
      )
    );
  }, []);

  const addChild = useCallback(
    async (id: string) => {
      if (!isAdmin) return;
      const name = prompt("Enter child's name:");
      if (!name) return;

      const child: Person = { id: genId(), name, _collapsed: false };

      // Create updated data first
      const updatedData = mapTree(data, (n) =>
        n.id === id ? { ...n, children: [...(n.children ?? []), child] } : n
      );

      // Update state immediately for UI responsiveness
      setData(updatedData);

      try {
        // Save the new child to Firebase
        await firebase.upsert(child.id, {
          name: child.name,
          parent_id: id,
          children: [],
          collapsed: false,
        });

        // Update the parent's children array in Firebase
        const parent = findNode(updatedData, id);
        if (parent) {
          await firebase.update(id, {
            children: parent.children?.map((c) => c.id) || [],
          });
        }
      } catch (error) {
        console.error("Error saving child to Firebase:", error);
        // Revert UI if there's an error
        setData(data);
        alert("Error saving child. Please try again.");
      }

      setMenu(null);
    },
    [data]
  );

  const editNode = useCallback(
    async (id: string) => {
      if (!isAdmin) return;
      const name = prompt("Enter new name:");
      if (!name) return;

      // Create updated data first
      const updatedData = mapTree(data, (n) =>
        n.id === id ? { ...n, name } : n
      );

      // Update state immediately for UI responsiveness
      setData(updatedData);

      try {
        // Update the node in Firebase
        await firebase.update(id, { name });
      } catch (error) {
        console.error("Error saving edited node to Firebase:", error);
        // Revert UI if there's an error
        setData(data);
        alert("Error saving changes. Please try again.");
      }

      setMenu(null);
    },
    [data]
  );

  const deleteNode = useCallback(
    async (id: string) => {
      if (!isAdmin) return;
      // Store the current data for potential revert
      const previousData = data;

      // Check if we're trying to delete the root node
      if (previousData.id === id) {
        alert("Cannot delete the root node.");
        return;
      }

      // Create updated data first
      const updatedData =
        updateTree(data, (n) => (n.id === id ? null : n)) || initialData;

      // Update state immediately for UI responsiveness
      setData(updatedData);

      try {
        // Recursively delete the node and all its children from Firebase
        await deleteNodeAndChildren(id);

        // Find and update all nodes that had this node as a child
        const allNodes = await firebase.getAll();
        const nodesWithChild = allNodes.filter(
          (
            node: FirebasePersonDoc // Change here
          ) => node.children && node.children.includes(id)
        );

        // Update each node to remove the deleted node from its children array
        for (const node of nodesWithChild) {
          const updatedChildren = node.children.filter(
            (childId: string) => childId !== id
          );

          await firebase.update(node.id, { children: updatedChildren });
        }
      } catch (error) {
        console.error("Error deleting node:", error);
        // Revert UI if there's an error
        setData(previousData);
        alert("Error deleting node. Please try again.");
      }

      setMenu(null);
    },
    [data]
  );

  const addParentAbove = useCallback(
    async (id: string) => {
      if (!isAdmin) return;
      const name = prompt("Enter parent's name:");
      if (!name) return;

      // Store the current data for potential revert
      const previousData = data;

      // Create updated data
      let updatedData: Person;
      if (previousData.id === id) {
        updatedData = { id: genId(), name, children: [previousData] };
      } else {
        updatedData = mapTree(previousData, (n) => {
          if (n.id === id) {
            return { id: genId(), name, children: [n] };
          }
          return n;
        });
      }

      // Update state immediately for UI responsiveness
      setData(updatedData);

      try {
        // Convert to flat structure and save to Firebase
        const flatData = flattenTree(updatedData);
        for (const person of flatData) {
          await firebase.upsert(person.id, {
            name: person.name,
            parent_id: person.parent_id,
            children: person.children,
            collapsed: person.collapsed,
          });
        }
      } catch (error) {
        console.error("Error saving new parent to Firebase:", error);
        // Revert UI if there's an error
        setData(previousData);
        alert("Error adding parent. Please try again.");
      }

      setMenu(null);
    },
    [data]
  );

  const setViewToNode = useCallback((id: string) => {
    setViewRootId(id);
  }, []);

  // Reset zoom and pan
  const resetView = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;

    const svg = d3.select(svgRef.current);
    svg
      .transition()
      .duration(750)
      .call(zoomRef.current.transform, d3.zoomIdentity);
  }, []);

  // Reset tree to initial data
  const resetTree = useCallback(async () => {
    if (
      window.confirm(
        "Are you sure you want to reset the tree? This will restore the original sample data."
      )
    ) {
      await initializeFirebaseData();
    }
  }, [initializeFirebaseData]);

  // D3 render (unchanged from your original code)
  useEffect(() => {
    if (loading) return;

    const el = svgRef.current;
    if (!el) return;

    const svgSel: d3.Selection<SVGSVGElement, unknown, null, undefined> =
      d3.select(el);
    svgSel.selectAll("*").remove();

    const width = el.clientWidth;
    const height = el.clientHeight;
    svgSel
      .attr("viewBox", `0 0 ${width} ${height}`)
      .style("background", "#f8fafc");

    const root = d3.hierarchy<Person>(viewRoot, (d) =>
      d._collapsed ? null : d.children
    );
    const tree = d3.tree<Person>().nodeSize([160, 120]);
    const rootNode = tree(root);

    // Centering
    const nodes = rootNode.descendants();
    const xVals = nodes.map((n) => n.x);
    const yVals = nodes.map((n) => n.y);
    const xMin = Math.min(...xVals);
    const xMax = Math.max(...xVals);
    const yMin = Math.min(...yVals);

    const marginTop = 100;
    const tx = width / 2 - (xMin + xMax) / 2;
    const ty = marginTop - yMin;

    const g = svgSel.append("g").attr("transform", `translate(${tx},${ty})`);

    // Zoom & Pan
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 2.5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform.toString());
      });

    svgSel.call(zoom);
    zoom.transform(svgSel, d3.zoomIdentity.translate(tx, ty));
    zoomRef.current = zoom;

    // Links
    g.selectAll<SVGPathElement, d3.HierarchyPointLink<Person>>("path.link")
      .data(rootNode.links())
      .join("path")
      .attr("class", "link")
      .attr("fill", "none")
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1.5)
      .attr("d", (d: d3.HierarchyPointLink<Person>) => {
        const midY = (d.source.y + d.target.y) / 2;
        return `M${d.source.x},${d.source.y} V${midY} H${d.target.x} V${d.target.y}`;
      });

    const nodeW = 140;
    const nodeH = 56;

    const node = g
      .selectAll<SVGGElement, d3.HierarchyPointNode<Person>>("g.node")
      .data(nodes)
      .join("g")
      .attr("class", "node")
      .attr(
        "transform",
        (d: d3.HierarchyPointNode<Person>) => `translate(${d.x},${d.y})`
      )
      .on("click", (_, d: d3.HierarchyPointNode<Person>) => {
        setSelectedNode(d.data.id);
      })
      .on(
        "contextmenu",
        (event: MouseEvent, d: d3.HierarchyPointNode<Person>) => {
          if (!isAdmin) return;
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY, nodeId: d.data.id });
        }
      )
      .style("cursor", "pointer");

    // Apply opacity transition after node creation
    node.style("opacity", 0).transition().duration(600).style("opacity", 1);

    // Node box with selection highlight
    node
      .append("rect")
      .attr("x", -nodeW / 2)
      .attr("y", -nodeH / 2)
      .attr("width", nodeW)
      .attr("height", nodeH)
      .attr("rx", 10)
      .attr("ry", 10)
      .attr("fill", (d: d3.HierarchyPointNode<Person>) =>
        d.data.id === selectedNode ? "#BBDEFB" : "#E3F2FD"
      )
      .attr("stroke", (d: d3.HierarchyPointNode<Person>) =>
        d.data.id === selectedNode ? "#0D47A1" : "#1565C0"
      )
      .attr("stroke-width", (d: d3.HierarchyPointNode<Person>) =>
        d.data.id === selectedNode ? 3 : 2
      );

    // Node text
    node.each(function (this: SVGGElement, d: d3.HierarchyPointNode<Person>) {
      const el = d3.select(this);
      const words = d.data.name.split(/\s+/);
      const lineHeight = 14;
      let line: string[] = [];
      let lineNumber = 0;
      let tspan = el
        .append("text")
        .attr("dy", -6)
        .attr("text-anchor", "middle")
        .attr("fill", "#0f172a")
        .style(
          "font-family",
          "system-ui, -apple-system, Segoe UI, Roboto, Arial"
        )
        .style("font-size", "14px")
        .style("font-weight", "600")
        .append("tspan")
        .attr("x", 0)
        .attr("y", 0);

      words.forEach((word) => {
        line.push(word);
        tspan.text(line.join(" "));
        if (
          (tspan.node() as SVGTextContentElement).getComputedTextLength() >
          nodeW - 10
        ) {
          line.pop();
          tspan.text(line.join(" "));
          line = [word];
          tspan = el
            .select("text")
            .append("tspan")
            .attr("x", 0)
            .attr("y", ++lineNumber * lineHeight)
            .text(word);
        }
      });

      // Immediate children count
      const cnt = countChildren(d.data);
      if (cnt > 0) {
        el.select("text")
          .append("tspan")
          .attr("x", 0)
          .attr("y", nodeH / 2 - 10)
          .attr("text-anchor", "middle")
          .attr("fill", "#475569")
          .style("font-size", "12px")
          .text(`(${cnt} child${cnt !== 1 ? "ren" : ""})`);
      }
    });

    // +/- toggler - positioned below the node
    const needsToggle = (d: d3.HierarchyPointNode<Person>) =>
      (d.data.children?.length ?? 0) > 0 || (d.data._collapsed ?? false);

    const toggler = node
      .filter((d: d3.HierarchyPointNode<Person>) => needsToggle(d))
      .append("g")
      .attr("transform", `translate(0, ${nodeH / 2 + 15})`)
      .style("cursor", "pointer")
      .on("click", (_, d: d3.HierarchyPointNode<Person>) => {
        toggleCollapse(d.data.id);
      });

    toggler
      .append("circle")
      .attr("r", 8)
      .attr("fill", "#ffffff")
      .attr("stroke", "#1565C0")
      .attr("stroke-width", 1.5);

    toggler
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#1565C0")
      .style("font-size", "12px")
      .style("font-weight", "700")
      .text((d: d3.HierarchyPointNode<Person>) =>
        d.data._collapsed ?? false ? "+" : "−"
      );

    // Add expand upward button if not at the top level
    if (viewRootId !== data.id) {
      const expandButton = g
        .append("g")
        .attr("transform", `translate(${rootNode.x}, ${-60})`)
        .style("cursor", "pointer")
        .on("click", () => {
          // Find the parent of the current view root
          const path = getPathToNode(data, viewRootId);
          if (path.length > 1) {
            setViewToNode(path[path.length - 2].id);
          }
        });

      expandButton
        .append("rect")
        .attr("x", -60)
        .attr("y", -15)
        .attr("width", 120)
        .attr("height", 30)
        .attr("rx", 15)
        .attr("ry", 15)
        .attr("fill", "#4caf50")
        .attr("stroke", "#2e7d32");

      expandButton
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", "white")
        .style("font-size", "12px")
        .style("font-weight", "600")
        .text("Show Parent ↑");
    }
  }, [
    data,
    viewRoot,
    selectedNode,
    toggleCollapse,
    viewRootId,
    setViewToNode,
    loading,
  ]);

  if (loading) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: "#f8fafc",
          flexDirection: "column",
        }}
      >
        <div className="loading-spinner"></div>
        <p style={{ marginTop: "20px" }}>Loading family tree...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: "#f8fafc",
          flexDirection: "column",
          padding: "20px",
        }}
      >
        <h2 style={{ color: "#e74c3c", marginBottom: "20px" }}>
          Error Loading Family Tree
        </h2>
        <p
          style={{
            color: "#7f8c8d",
            marginBottom: "30px",
            textAlign: "center",
          }}
        >
          {loadError}
        </p>
        {/* Firebase error handling */}
        {loadError.includes("Firebase") && (
          <div style={{ marginTop: "20px", textAlign: "center" }}>
            <p style={{ marginBottom: "10px" }}>
              Please check your Firebase configuration:
            </p>
            <button
              onClick={() =>
                window.open("https://console.firebase.google.com/", "_blank")
              }
              style={{
                padding: "10px 20px",
                background: "#3498db",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                marginTop: "10px",
                marginRight: "10px",
              }}
            >
              Open Firebase Console
            </button>
          </div>
        )}
        <button
          onClick={loadDataFromFirebase}
          style={{
            padding: "10px 20px",
            background: "#3498db",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            marginTop: "20px",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#f8fafc",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 10,
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={resetView}
          style={{
            padding: "8px 12px",
            background: "#1565C0",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontFamily: "system-ui",
            fontSize: "14px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          Reset View
        </button>

        {viewRootId !== "3" && (
          <button
            onClick={() => setViewToNode("3")}
            style={{
              padding: "8px 12px",
              background: "#4caf50",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontFamily: "system-ui",
              fontSize: "14px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            Focus on Grandparent
          </button>
        )}

        {viewRootId !== data.id && (
          <button
            onClick={() => setViewToNode(data.id)}
            style={{
              padding: "8px 12px",
              background: "#9c27b0",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontFamily: "system-ui",
              fontSize: "14px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            Show Full Tree
          </button>
        )}

        {/* <button
          onClick={resetTree}
          style={{
            padding: "8px 12px",
            background: "#ff9800",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontFamily: "system-ui",
            fontSize: "14px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          Reset Tree Data
        </button> */}
      </div>

      {/* Breadcrumb navigation */}
      {ancestorPath.length > 1 && (
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 10,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.9)",
            padding: "8px 12px",
            borderRadius: "4px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          <span style={{ marginRight: "8px", color: "#64748b" }}>
            Ancestors:
          </span>
          {ancestorPath.slice(0, -1).map((person, index) => (
            <React.Fragment key={person.id}>
              <button
                onClick={() => setViewToNode(person.id)}
                style={{
                  padding: "4px 8px",
                  background: "transparent",
                  color: "#1565C0",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "system-ui",
                  fontSize: "14px",
                  textDecoration: "underline",
                }}
              >
                {person.name}
              </button>
              {index < ancestorPath.length - 2 && (
                <span style={{ margin: "0 4px", color: "#64748b" }}>→</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      <svg ref={svgRef} width="100%" height="100%" />

      {menu && isAdmin && (
        <ul
          ref={contextMenuRef}
          style={{
            position: "absolute",
            top: menu.y,
            left: menu.x,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "6px 0",
            listStyle: "none",
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
            fontSize: "14px",
            zIndex: 1000,
            minWidth: "150px",
          }}
        >
          <li
            style={{
              padding: "8px 14px",
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onClick={() => addChild(menu.nodeId)}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLLIElement).style.background = "#f1f5f9")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLLIElement).style.background =
                "transparent")
            }
          >
            ➕ Add Child
          </li>
          <li
            style={{
              padding: "8px 14px",
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onClick={() => addParentAbove(menu.nodeId)}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLLIElement).style.background = "#f1f5f9")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLLIElement).style.background =
                "transparent")
            }
          >
            👆 Add Parent Above
          </li>
          <li
            style={{
              padding: "8px 14px",
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onClick={() => editNode(menu.nodeId)}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLLIElement).style.background = "#f1f5f9")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLLIElement).style.background =
                "transparent")
            }
          >
            ✏️ Edit
          </li>
          <li
            style={{
              padding: "8px 14px",
              cursor: "pointer",
              color: "#dc2626",
              transition: "background 0.2s",
            }}
            onClick={() => deleteNode(menu.nodeId)}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLLIElement).style.background = "#f1f5f9")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLLIElement).style.background =
                "transparent")
            }
          >
            🗑️ Delete
          </li>
          <hr
            style={{
              margin: "4px 0",
              border: "none",
              borderTop: "1px solid #e5e7eb",
            }}
          />
          <li
            style={{
              padding: "8px 14px",
              cursor: "pointer",
              color: "#475569",
              transition: "background 0.2s",
            }}
            onClick={() => setMenu(null)}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLLIElement).style.background = "#f1f5f9")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLLIElement).style.background =
                "transparent")
            }
          >
            ❌ Cancel
          </li>
        </ul>
      )}

      {/* Debug information */}
      {showDebug && (
        <DebugInfo
          firebaseConfig={{
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
          }}
          environment={import.meta.env.MODE}
          firebaseStatus={firebaseStatus}
          error={loadError}
        />
      )}
    </div>
  );
};

export default FamilyTree;
