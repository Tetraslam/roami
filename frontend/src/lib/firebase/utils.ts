import { 
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './config';
import { Collections } from './types';
import type { 
  UserProfile,
  Trip,
  Memory,
  POI,
  UserPreferences,
  WeatherData,
  CollectionName,
  ChatMessage,
} from './types';

// Generic type for all our data types
type FirebaseData = UserProfile | Trip | Memory | POI | UserPreferences | WeatherData;

// Generic CRUD operations
export async function createDocument<T extends FirebaseData>(
  collectionName: CollectionName,
  data: T,
  id?: string
) {
  const docRef = id ? doc(db, collectionName, id) : doc(collection(db, collectionName));
  await setDoc(docRef, { ...data, id: docRef.id });
  return docRef.id;
}

export async function getDocument<T extends FirebaseData>(
  collectionName: CollectionName,
  id: string
): Promise<T | null> {
  const docRef = doc(db, collectionName, id);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() as T : null;
}

export async function updateDocument<T extends Partial<FirebaseData>>(
  collectionName: CollectionName,
  id: string,
  data: T
) {
  const docRef = doc(db, collectionName, id);
  await updateDoc(docRef, data);
}

export async function deleteDocument(
  collectionName: CollectionName,
  id: string
) {
  const docRef = doc(db, collectionName, id);
  await deleteDoc(docRef);
}

// Media upload utilities
export async function uploadMedia(
  file: File,
  path: string
): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

// Trip-specific utilities
export async function getCurrentTrip(userId: string): Promise<Trip | null> {
  const tripsRef = collection(db, 'trips');
  const q = query(
    tripsRef,
    where('userId', '==', userId),
    where('status', '==', 'active'),
    orderBy('startTime', 'desc'),
    limit(1)
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.empty ? null : querySnapshot.docs[0].data() as Trip;
}

export async function getTripMemories(tripId: string): Promise<Memory[]> {
  const memoriesRef = collection(db, 'memories');
  const q = query(
    memoriesRef,
    where('tripId', '==', tripId),
    orderBy('createdAt', 'desc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as Memory);
}

// POI utilities
export async function getNearbyPOIs(
  latitude: number,
  longitude: number,
  radiusKm: number = 5
): Promise<POI[]> {
  // TODO: Implement geospatial query once we set up Geofirestore
  const poisRef = collection(db, 'pois');
  const querySnapshot = await getDocs(poisRef);
  return querySnapshot.docs.map(doc => doc.data() as POI);
}

// Weather utilities
export async function getLatestWeather(
  latitude: number,
  longitude: number
): Promise<WeatherData | null> {
  const weatherRef = collection(db, 'weather');
  const q = query(
    weatherRef,
    where('location.latitude', '==', latitude),
    where('location.longitude', '==', longitude),
    orderBy('timestamp', 'desc'),
    limit(1)
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.empty ? null : querySnapshot.docs[0].data() as WeatherData;
}

// Message utilities
export async function saveMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<string> {
  const messagesRef = collection(db, Collections.MESSAGES);
  const docRef = doc(messagesRef);
  const messageData: ChatMessage = {
    ...message,
    id: docRef.id,
    timestamp: Timestamp.now(),
  };
  
  await setDoc(docRef, messageData);
  return docRef.id;
}

export function subscribeToMessages(
  userId: string,
  callback: (messages: ChatMessage[]) => void,
  messageLimit: number = 50
) {
  console.log('Setting up message subscription for user:', userId);
  const messagesRef = collection(db, Collections.MESSAGES);
  const q = query(
    messagesRef,
    where('userId', '==', userId),
    orderBy('timestamp', 'asc'),
    limit(messageLimit)
  );
  
  return onSnapshot(q, (snapshot) => {
    console.log('Received Firestore update with', snapshot.docs.length, 'messages');
    const messages = snapshot.docs.map(doc => {
      const data = doc.data() as ChatMessage;
      console.log('Message:', { id: doc.id, type: data.type, timestamp: data.timestamp });
      return data;
    });
    callback(messages);
  }, (error) => {
    console.error('Error in messages subscription:', error);
  });
}

export async function getRecentMessages(
  userId: string,
  messageLimit: number = 50
): Promise<ChatMessage[]> {
  const messagesRef = collection(db, Collections.MESSAGES);
  const q = query(
    messagesRef,
    where('userId', '==', userId),
    orderBy('timestamp', 'asc'),
    limit(messageLimit)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as ChatMessage);
} 