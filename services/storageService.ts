import { ProductionEntry, OffDay, User } from '../types';

/**
 * GOOGLE SHEETS CONFIGURATION
 * 
 * 1. To make the database work for EVERYONE, paste your URL below.
 * 2. If this is left as a placeholder, users will default to "Local Storage Only"
 *    until they manually configure it in their own browser.
 */
export const HARDCODED_URL = "https://script.google.com/macros/s/AKfycby89ZKqdlsZilyBVQHUT7DLrvKdmethDA_BnNeLYmEJlvzL0vQdMzQycB9PcTf-DGp_/exec"; // <-- PASTE YOUR URL HERE

const getSheetUrl = () => {
  // 1. Priority: Manual override in current browser's localStorage
  const savedUrl = localStorage.getItem('halagel_sheets_api_url');
  if (savedUrl && savedUrl.startsWith('https://script.google.com')) return savedUrl;
  
  // 2. Fallback: The central URL defined in the code for all users
  if (HARDCODED_URL && HARDCODED_URL.startsWith('https://script.google.com')) return HARDCODED_URL;
  
  return null;
};

export const GoogleSheetsService = {
  isEnabled: () => !!getSheetUrl(),
  
  getActiveUrl: () => getSheetUrl(),

  fetchData: async <T>(action: string): Promise<T | null> => {
    const url = getSheetUrl();
    if (!url) return null;

    try {
      const seed = Math.random().toString(36).substring(7);
      const response = await fetch(`${url}?action=${action}&_t=${Date.now()}&_s=${seed}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`Sheets fetch error (${action}):`, error);
      return null;
    }
  },

  saveData: async (action: string, payload: any): Promise<boolean> => {
    const url = getSheetUrl();
    if (!url) return false;

    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data: payload, timestamp: Date.now() })
      });
      return true;
    } catch (error) {
      console.error(`Sheets save error (${action}):`, error);
      return false;
    }
  }
};
