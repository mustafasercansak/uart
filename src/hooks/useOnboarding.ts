import { useState } from 'react';

const STORAGE_KEY = 'uart_onboarding_done';

export function useOnboarding() {
  const [show, setShow] = useState(() => !localStorage.getItem(STORAGE_KEY));

  return { 
    show, 
    dismiss: () => {
      localStorage.setItem(STORAGE_KEY, '1');
      setShow(false);
    } 
  };
}
