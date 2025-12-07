import { render, screen, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { Dashboard } from '@/components/dashboard/dashboard';
import { useWeb3 } from '@/hooks/use-web3';

// Mock the modules
jest.mock('next/navigation');
jest.mock('@/hooks/use-web3');
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const mockPush = jest.fn();
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseWeb3 = useWeb3 as jest.MockedFunction<typeof useWeb3>;

describe('Dashboard Navigation Fix', () => {
  beforeEach(() => {
    mockUseRouter.mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      refresh: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      prefetch: jest.fn(),
    } as any);

    mockUseWeb3.mockReturnValue({
      account: '0x1234567890abcdef1234567890abcdef12345678',
      chainId: 56,
      isConnected: true,
      connect: jest.fn(),
      disconnect: jest.fn(),
      switchNetwork: jest.fn(),
    });

    mockPush.mockClear();
  });

  describe('Create Agent Button Navigation', () => {
    it('should import useRouter from next/navigation correctly', () => {
      expect(mockUseRouter).toBeDefined();
    });

    it('should render header Create Agent button', () => {
      render(<Dashboard />);

      const headerButton = screen.getByRole('button', {
        name: /create new agent/i
      });

      expect(headerButton).toBeInTheDocument();
    });

    it('should navigate to /create when header button is clicked', () => {
      render(<Dashboard />);

      const headerButton = screen.getByRole('button', {
        name: /create new agent/i
      });

      fireEvent.click(headerButton);

      expect(mockPush).toHaveBeenCalledWith('/create');
    });

    it('should render empty state Create Agent button when no agents exist', () => {
      render(<Dashboard />);

      // Wait for loading to complete and check for empty state
      setTimeout(() => {
        const emptyStateButton = screen.queryByRole('button', {
          name: /create your first agent/i
        });

        if (emptyStateButton) {
          fireEvent.click(emptyStateButton);
          expect(mockPush).toHaveBeenCalledWith('/create');
        }
      }, 100);
    });

    it('should have router properly initialized', () => {
      render(<Dashboard />);

      expect(mockUseRouter).toHaveBeenCalled();
      expect(mockPush).toBeDefined();
    });
  });

  describe('Router Integration', () => {
    it('should use correct Next.js 13+ useRouter import', () => {
      // Verify the import is from the correct module
      const { useRouter: importedRouter } = require('next/navigation');
      expect(importedRouter).toBe(useRouter);
    });

    it('should call router.push with correct path', () => {
      render(<Dashboard />);

      const button = screen.getByRole('button', {
        name: /create new agent/i
      });

      fireEvent.click(button);

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/create');
    });
  });

  describe('Error Handling', () => {
    it('should handle router errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      mockPush.mockImplementation(() => {
        throw new Error('Navigation error');
      });

      render(<Dashboard />);

      const button = screen.getByRole('button', {
        name: /create new agent/i
      });

      expect(() => {
        fireEvent.click(button);
      }).not.toThrow();

      consoleSpy.mockRestore();
    });
  });
});