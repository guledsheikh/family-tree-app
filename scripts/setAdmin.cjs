const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uid = "k6yqTUK7iGPdQ0bGWRrnTzUTiTO2";

async function makeAdmin() {
 await admin.auth().setCustomUserClaims(uid, {});

  console.log("✅ Admin claim set successfully");
  process.exit(0);
}

makeAdmin().catch((err) => {
  console.error("❌ Failed to set admin:", err);
  process.exit(1);
});
