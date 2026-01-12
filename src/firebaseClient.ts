// firebaseClient.ts
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  updateDoc, 
  getDoc,
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';

import { getAuth } from 'firebase/auth';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Define proper types

export interface FirebasePersonDoc {
  id: string;
  name: string;
  parent_id: string | null;
  children: string[];
  collapsed: boolean;
  updatedAt?: Timestamp;
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Cloud Firestore
export const db = getFirestore(app);

// Firestore collection reference
export const familyTreeCollection = collection(db, 'family_tree');

// Helper functions with proper types
export const firebase = {
  // Get all documents
  getAll: async (): Promise<FirebasePersonDoc[]> => {
    try {
      const querySnapshot = await getDocs(familyTreeCollection);
      return querySnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as FirebasePersonDoc));
    } catch (error) {
      console.error("Error getting documents:", error);
      throw error;
    }
  },
  
  // Get document by ID
  getById: async (id: string): Promise<FirebasePersonDoc | null> => {
    try {
      const docRef = doc(db, 'family_tree', id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { 
        id: docSnap.id, 
        ...docSnap.data() 
      } as FirebasePersonDoc : null;
    } catch (error) {
      console.error("Error getting document:", error);
      throw error;
    }
  },
  
  // Create or update document
  upsert: async (id: string, data: Omit<FirebasePersonDoc, 'id'>) => {
    try {
      const docRef = doc(db, 'family_tree', id);
      await setDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
      }, { merge: true });
      return true;
    } catch (error) {
      console.error("Error upserting document:", error);
      throw error;
    }
  },
  
  // Delete document
  delete: async (id: string) => {
    try {
      const docRef = doc(db, 'family_tree', id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error("Error deleting document:", error);
      throw error;
    }
  },
  
  // Update specific fields
  update: async (id: string, data: Partial<Omit<FirebasePersonDoc, 'id'>>) => {
    try {
      const docRef = doc(db, 'family_tree', id);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error("Error updating document:", error);
      throw error;
    }
  },
  
  // Query documents by field value
  
};

// ✅ Debug check
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error("❌ Firebase env vars are missing!");
} else {
  console.log("✅ Firebase env vars loaded");
}