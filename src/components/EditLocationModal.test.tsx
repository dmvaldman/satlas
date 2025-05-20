// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditLocationModal from './EditLocationModal';
import BaseModal from './BaseModal'; // Import BaseModal to potentially spy on props passed to it

// Mock BaseModal to verify props and simulate its onClose behavior if needed
vi.mock('./BaseModal', () => ({
  default: vi.fn(({ isOpen, onClose, children }) => {
    if (!isOpen) return null;
    // Simulate BaseModal's own close button or overlay click by calling its onClose
    // This mock allows us to check if EditLocationModal correctly passes its onClose to BaseModal
    return (
      <div data-testid="mock-base-modal">
        {children}
        <button data-testid="base-modal-close-trigger" onClick={onClose}>
          Internal BaseModal Close
        </button>
      </div>
    );
  }),
}));

describe('EditLocationModal.tsx', () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onConfirm: mockOnConfirm,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario: Rendering', () => {
    it('renders correctly when isOpen is true', () => {
      render(<EditLocationModal {...defaultProps} />);
      expect(screen.getByText(/Photo location is missing. Would you like to select it manually on the map?/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Select Location/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    it('does not render (or BaseModal handles it) when isOpen is false', () => {
      render(<EditLocationModal {...defaultProps} isOpen={false} />);
      // BaseModal mock returns null if isOpen is false
      expect(screen.queryByTestId("mock-base-modal")).not.toBeInTheDocument();
      expect(screen.queryByText(/Photo location is missing/i)).not.toBeInTheDocument();
    });
  });

  describe('Scenario: "Select Location" Button Click', () => {
    it('calls props.onConfirm and does not call props.onClose', () => {
      render(<EditLocationModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /Select Location/i }));

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Scenario: "Cancel" Button Click', () => {
    it('calls props.onClose and does not call props.onConfirm', () => {
      render(<EditLocationModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Scenario: BaseModal onClose (e.g., overlay click)', () => {
    it('EditLocationModal onClose is called when BaseModal triggers its onClose', () => {
      // This test relies on the BaseModal mock correctly calling its onClose prop
      render(<EditLocationModal {...defaultProps} />);
      
      // Find the mock button inside BaseModal that triggers its onClose
      const baseModalCloseTrigger = screen.getByTestId('base-modal-close-trigger');
      fireEvent.click(baseModalCloseTrigger);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });
});
