// Firebase configuration for Pushup Tracker
const firebaseConfig = {
  apiKey: "AIzaSyCeogWE7nKuzfn0Htr2tWrscf-yYCLKdnk",
  authDomain: "pushupwithfriends.firebaseapp.com",
  projectId: "pushupwithfriends",
  storageBucket: "pushupwithfriends.firebasestorage.app",
  messagingSenderId: "762894242842",
  appId: "1:762894242842:web:ff5c9bb9ad16617bef2da3"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Enable offline persistence (data available when offline)
db.enablePersistence().catch(err => {
  console.log('Offline persistence not available:', err.code);
});
