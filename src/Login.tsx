import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "./firebaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const login = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Authentication error");
      }
    }
  };

  const signup = async () => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Authentication error");
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  if (auth.currentUser) {
    return (
      <div>
        <p>
          Logged in as <b>{auth.currentUser.email}</b>
        </p>
        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 300 }}>
      <h3>Family Login</h3>

      <input
        type="email"
        placeholder="Email"
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        placeholder="Password"
        onChange={(e) => setPassword(e.target.value)}
      />

      <button onClick={login}>Login</button>
      <button onClick={signup}>Create Account</button>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
