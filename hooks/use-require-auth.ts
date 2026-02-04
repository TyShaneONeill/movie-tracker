import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';

interface UseRequireAuthReturn {
  /** Call this to require auth before performing an action */
  requireAuth: (action: () => void, message?: string) => void;
  /** Whether the login prompt modal should be visible */
  isLoginPromptVisible: boolean;
  /** The contextual message for the login prompt */
  loginPromptMessage: string;
  /** Hide the login prompt modal */
  hideLoginPrompt: () => void;
}

/**
 * Hook for gating actions behind authentication
 *
 * @example
 * const { requireAuth, isLoginPromptVisible, loginPromptMessage, hideLoginPrompt } = useRequireAuth();
 *
 * // In a component:
 * <Pressable onPress={() => requireAuth(handleLike, 'Sign in to like movies')}>
 *   <Text>Like</Text>
 * </Pressable>
 *
 * <LoginPromptModal
 *   visible={isLoginPromptVisible}
 *   onClose={hideLoginPrompt}
 *   message={loginPromptMessage}
 * />
 */
export function useRequireAuth(): UseRequireAuthReturn {
  const { user } = useAuth();
  const [isLoginPromptVisible, setIsLoginPromptVisible] = useState(false);
  const [loginPromptMessage, setLoginPromptMessage] = useState('');

  const requireAuth = useCallback((action: () => void, message?: string) => {
    if (user) {
      // User is authenticated, proceed with action
      action();
    } else {
      // User is not authenticated, show login prompt
      setLoginPromptMessage(message || 'Sign in to continue');
      setIsLoginPromptVisible(true);
    }
  }, [user]);

  const hideLoginPrompt = useCallback(() => {
    setIsLoginPromptVisible(false);
    setLoginPromptMessage('');
  }, []);

  return {
    requireAuth,
    isLoginPromptVisible,
    loginPromptMessage,
    hideLoginPrompt,
  };
}
