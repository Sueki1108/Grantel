// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBVi6N-Linrk9k6z9vO-Z36XmtsD9QKwwA",
  authDomain: "grantel-1oth2.firebaseapp.com",
  projectId: "grantel-1oth2",
  storageBucket: "grantel-1oth2.appspot.com",
  messagingSenderId: "698741029963",
  appId: "1:698741029963:web:538fab20dc90e3eedde1ce"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export { app, firebaseConfig };
