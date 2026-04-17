export type ClientType = 'Fund' | 'Company';
export type Priority = 'High' | 'Medium' | 'Low';

export interface RawClient {
  name: string;
  type: string;
  city: string;
  country: string;
  address?: string;
  notes?: string;
  priority?: string;
  'last met'?: string; // PapaParse lowercases headers with spaces
  lastmet?: string;
  last_met?: string;
  coverage?: string;
}

export interface Client {
  id: string;
  name: string;
  type: ClientType;
  city: string;
  country: string;
  address: string; // full street address (optional in sheet, empty string if absent)
  notes: string;
  priority: Priority;
  lastMet: string | null; // ISO date string YYYY-MM-DD or null
  coverage: string;
  coordinates: [number, number] | null; // [lng, lat]
  distance?: number; // km from nearest search center
}

export interface SearchCenter {
  displayName: string;
  city: string;
  country: string;
  coordinates: [number, number];
}
