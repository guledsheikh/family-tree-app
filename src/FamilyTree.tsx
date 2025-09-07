// src/FamilyTree.tsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";

// ----- Types -----
export interface Person {
  id: string;
  name: string;
  children?: Person[];
  _collapsed?: boolean;
}

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

// ----- Component -----
const FamilyTree: React.FC = () => {
  const [data, setData] = useState<Person>(initialData);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [viewRootId, setViewRootId] = useState<string>("3"); // Start at grandparent level
  const svgRef = useRef<SVGSVGElement | null>(null);
  const contextMenuRef = useRef<HTMLUListElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

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

  const addChild = useCallback((id: string) => {
    const name = prompt("Enter child's name:");
    if (!name) return;
    const child: Person = { id: genId(), name, _collapsed: false };
    setData((prev) =>
      mapTree(prev, (n) =>
        n.id === id ? { ...n, children: [...(n.children ?? []), child] } : n
      )
    );
    setMenu(null);
  }, []);

  const editNode = useCallback((id: string) => {
    const name = prompt("Enter new name:");
    if (!name) return;
    setData((prev) => mapTree(prev, (n) => (n.id === id ? { ...n, name } : n)));
    setMenu(null);
  }, []);

  const deleteNode = useCallback(
    (id: string) => {
      if (data.id === id) {
        alert("Cannot delete the root node.");
        return;
      }
      setData((prev) => {
        const next = updateTree(prev, (n) => (n.id === id ? null : n));
        return next ?? prev;
      });
      setMenu(null);
    },
    [data.id]
  );

  const addParentAbove = useCallback((id: string) => {
    const name = prompt("Enter parent's name:");
    if (!name) return;

    setData((prev) => {
      // If we're adding above the root
      if (prev.id === id) {
        return { id: genId(), name, children: [prev] };
      }

      // If we're adding above a non-root node
      return mapTree(prev, (n) => {
        if (n.id === id) {
          return { id: genId(), name, children: [n] };
        }
        return n;
      });
    });

    setMenu(null);
  }, []);

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

  // D3 render
  useEffect(() => {
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
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
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
      .on("click", (event: MouseEvent, d: d3.HierarchyPointNode<Person>) => {
        setSelectedNode(d.data.id);
      })
      .on(
        "contextmenu",
        (event: MouseEvent, d: d3.HierarchyPointNode<Person>) => {
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
      .attr("transform", `translate(0, ${nodeH / 2 + 15})`) // Position below the node
      .style("cursor", "pointer")
      .on("click", (event: MouseEvent, d: d3.HierarchyPointNode<Person>) => {
        event.stopPropagation();
        toggleCollapse(d.data.id);
      });

    toggler
      .append("circle")
      .attr("r", 8) // Smaller circle
      .attr("fill", "#ffffff")
      .attr("stroke", "#1565C0")
      .attr("stroke-width", 1.5);

    toggler
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#1565C0")
      .style("font-size", "12px") // Smaller text
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
  }, [data, viewRoot, selectedNode, toggleCollapse, viewRootId, setViewToNode]);

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

      {menu && (
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
    </div>
  );
};

export default FamilyTree;
