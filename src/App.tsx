// src/App.tsx
import React from "react";
import FamilyTree from "./FamilyTree";
import "./App.css";

console.log("Supabase URL:", import.meta.env.VITE_SUPABASE_URL);
console.log("Supabase Key:", import.meta.env.VITE_SUPABASE_ANON_KEY);

function App() {
  return (
    <div className="App">
      <FamilyTree />
    </div>
  );
}

export default App;
