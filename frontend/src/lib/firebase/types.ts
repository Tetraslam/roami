import { Timestamp } from 'firebase/firestore';

// User profile
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: Timestamp;
  currentTripId?: string;
}

// Trip/Journey
export interface Trip {
  id: string;
  userId: string;
  title: string;
  startLocation: GeoPoint;
  endLocation?: GeoPoint;
  startTime: Timestamp;
  endTime?: Timestamp;
  status: 'active' | 'completed' | 'planned';
  totalDistance?: number;
  route?: GeoPoint[];
  memories: Memory[];
}

// Location point
export interface GeoPoint {
  latitude: number;
  longitude: number;
  timestamp: Timestamp;
}

// Memory (voice notes, images, etc.)
export interface Memory {
  id: string;
  tripId: string;
  userId: string;
  type: 'voice' | 'image' | 'text';
  content: {
    mediaUrl?: string;
    transcript?: string;
    text?: string;
    aiResponse?: string;
  };
  location: GeoPoint;
  createdAt: Timestamp;
  tags?: string[];
}

// Place of Interest
export interface POI {
  id: string;
  name: string;
  location: GeoPoint;
  type: 'restaurant' | 'attraction' | 'rest_stop' | 'scenic_view' | 'other';
  description?: string;
  rating?: number;
  userRatings?: number;
  photos?: string[];
  historicalData?: {
    year: number;
    description: string;
    photos?: string[];
  }[];
}

// User Preferences
export interface UserPreferences {
  userId: string;
  theme: 'light' | 'dark' | 'system';
  language: string;
  notificationSettings: {
    pushEnabled: boolean;
    emailEnabled: boolean;
    types: {
      tripUpdates: boolean;
      nearbyPOI: boolean;
      weather: boolean;
    };
  };
  privacySettings: {
    shareLocation: boolean;
    shareTrips: boolean;
    publicProfile: boolean;
  };
}

// Weather Data
export interface WeatherData {
  location: GeoPoint;
  timestamp: Timestamp;
  temperature: number;
  conditions: string;
  forecast: {
    time: Timestamp;
    temperature: number;
    conditions: string;
  }[];
}

// Chat Message
export interface ChatMessage {
  id: string;
  userId: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Timestamp;
  hasImage?: boolean;
  imageUrl?: string;
  tripId?: string;
}

// Collection Names (for type-safe collection references)
export const Collections = {
  USERS: 'users',
  TRIPS: 'trips',
  MEMORIES: 'memories',
  POIS: 'pois',
  PREFERENCES: 'preferences',
  WEATHER: 'weather',
  MESSAGES: 'messages',
} as const;

export type CollectionName = typeof Collections[keyof typeof Collections]; 