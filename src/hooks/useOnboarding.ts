import { useState, useEffect } from 'react';

const STORAGE_KEY = 'uart_onboarding_done';

export function useOnboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      // Use functional update or setTimeout to avoid sync setState in effect body
      setShow(s => s === true ? s : true);
    }
  }, []);

  return { 
    show, 
    dismiss: () => {
      localStorage.setItem(STORAGE_KEY, '1');
      setShow(false);
    } 
  };
}
