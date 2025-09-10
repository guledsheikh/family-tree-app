// src/DebugInfo.tsx
import React from "react";

interface DebugInfoProps {
  supabaseUrl: string;
  supabaseKey: string;
  environment: string;
}

const DebugInfo: React.FC<DebugInfoProps> = ({
  supabaseUrl,
  supabaseKey,
  environment,
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
      }}
    >
      <h4>Debug Information</h4>
      <p>Environment: {environment}</p>
      <p>Supabase URL: {supabaseUrl ? "Set" : "Not set"}</p>
      <p>Supabase Key: {supabaseKey ? "Set" : "Not set"}</p>
      <p>Build Date: {new Date().toISOString()}</p>
    </div>
  );
};

export default DebugInfo;
