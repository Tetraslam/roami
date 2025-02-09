import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, FirebaseStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, Functions, connectFunctionsEmulator } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  // TODO: Add your Firebase config here
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validate config
Object.entries(firebaseConfig).forEach(([key, value]) => {
  if (!value) {
    console.error(`Missing Firebase config value for ${key}`);
  }
});

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let functions: Functions;

function initializeFirebase() {
  if (!getApps().length) {
    try {
      console.log('Initializing Firebase...');
      app = initializeApp(firebaseConfig);
      console.log('Firebase initialized successfully');

      console.log('Setting up Firebase services...');
      auth = getAuth(app);
      db = getFirestore(app);
      storage = getStorage(app);
      functions = getFunctions(app);
      console.log('Firebase services initialized');

      // Test Firestore connection
      console.log('Testing Firestore connection...');
      const testDoc = doc(db, '_test_connection', 'test');
      getDoc(testDoc)
        .then(() => console.log('Firestore connection successful'))
        .catch((error) => console.error('Firestore connection error:', error));

      // Connect to emulators in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Development environment detected');
        // Uncomment these lines to use Firebase emulators
        // connectAuthEmulator(auth, 'http://localhost:9099');
        // connectFirestoreEmulator(db, 'localhost', 8080);
        // connectStorageEmulator(storage, 'localhost', 9199);
        // connectFunctionsEmulator(functions, 'localhost', 5001);
      }
    } catch (error) {
      console.error('Error initializing Firebase:', error);
      console.error('Firebase config:', {
        ...firebaseConfig,
        apiKey: firebaseConfig.apiKey ? '[REDACTED]' : undefined,
      });
      throw error;
    }
  } else {
    console.log('Using existing Firebase instance');
    app = getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app);
  }
}

// Initialize Firebase
initializeFirebase();

export { app, auth, db, storage, functions }; 