import { useEffect, useRef, useState } from 'react';

interface UseBarcodeScannerProps {
  onScan: (barcode: string) => void;
  // Threshold in ms to distinguish typing from scanning.
  // Standard scanners type incredibly fast (<30ms per char).
  timeThreshold?: number; 
}

export function useBarcodeScanner({ onScan, timeThreshold = 50 }: UseBarcodeScannerProps) {
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isReady, setIsReady] = useState(true);
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Keep the latest callback in a ref to avoid re-binding the event listener on every render
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement || 
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      
      // If time since last keystroke is too long, clear the buffer
      if (timeDiff > timeThreshold) {
        bufferRef.current = '';
      }

      lastKeyTimeRef.current = currentTime;

      // Handle Enter key (end of scan)
      if (e.key === 'Enter') {
        if (bufferRef.current.length > 3) { // Arbitrary min length for a valid barcode
          onScanRef.current(bufferRef.current);
          e.preventDefault();
        }
        bufferRef.current = '';
        return;
      }

      // Append printable characters (basic alphanumeric and common symbols)
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }

      // Optional: Clear buffer after a longer timeout just to be safe
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        bufferRef.current = '';
      }, 500);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [timeThreshold]);

  return { isReady };
}
