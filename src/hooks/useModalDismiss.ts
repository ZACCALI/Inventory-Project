import { useEffect } from 'react';

/**
 * Custom hook to handle Escape key dismissal and body scroll locking for modals and dialogs.
 * 
 * @param isOpen Whether the modal/dialog is currently visible
 * @param onClose Callback fired when Escape key is pressed
 */
export function useModalDismiss(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);
}

export default useModalDismiss;
