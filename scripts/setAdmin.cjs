const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uid = "EUoIUroTaWM489JOUgX9fNqnoQ53";

async function makeAdmin() {
 await admin.auth().setCustomUserClaims(uid, {
  admin: true,
});

  console.log("✅ Admin claim set successfully");
  process.exit(0);
}

makeAdmin().catch((err) => {
  console.error("❌ Failed to set admin:", err);
  process.exit(1);
});
