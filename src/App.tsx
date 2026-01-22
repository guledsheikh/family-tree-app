import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth } from "./firebaseClient";

import FamilyTree from "./FamilyTree";
import Login from "./Login";

import "./App.css";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (u) {
        const token = await u.getIdTokenResult();
        console.log("ADMIN CLAIM:", token.claims.admin);
        setIsAdmin(!!token.claims.admin);
      } else {
        setIsAdmin(false);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  if (loading) {
    return <div className="App">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="App">
        <Login />
      </div>
    );
  }

  return (
    <div className="App">
      <FamilyTree isAdmin={isAdmin} />
    </div>
  );
}

export default App;
