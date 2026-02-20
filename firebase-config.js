// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBtyCSCNiIXSEkLW3j-k6mjC1oXHGTTUbk",
  authDomain: "calproduct-53dc0.firebaseapp.com",
  projectId: "calproduct-53dc0",
  storageBucket: "calproduct-53dc0.firebasestorage.app",
  messagingSenderId: "377170422640",
  appId: "1:377170422640:web:c7092164d15640406b3db5",
  measurementId: "G-3MFCRT3XWN"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Enable Google Sign-In provider
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Optional: Add scopes if needed
googleProvider.addScope('profile');
googleProvider.addScope('email');

// Optional: Set custom parameters
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Collections
const PRODUCTS_COLLECTION = "products";
const DUTY_COLLECTION = "dutyCategories";

// Enable offline persistence
db.enablePersistence()
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a time
      console.log('Persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      // The current browser doesn't support persistence
      console.log('Persistence not supported');
    }
  });


