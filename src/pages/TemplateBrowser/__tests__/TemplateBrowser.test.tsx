import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TemplateBrowser from '../index';
import { BrowserRouter } from 'react-router-dom';

// Mock the hooks
const mockSetProfile = vi.fn();
const mockUpdateLayout = vi.fn();
const mockSetScenario = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../../hooks/useSimulation', () => ({
  useSimulation: () => ({
    setProfile: mockSetProfile,
    updateLayout: mockUpdateLayout,
    setScenario: mockSetScenario
  })
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual as any,
    useNavigate: () => mockNavigate
  };
});

describe('TemplateBrowser Component', () => {
  it('should render template cards correctly', () => {
    render(
      <BrowserRouter>
        <TemplateBrowser />
      </BrowserRouter>
    );
    
    expect(screen.getByText('Şablon Kütüphanesi')).toBeInTheDocument();
    expect(screen.getByText('Açık Kaynak Ventilatör')).toBeInTheDocument();
  });

  it('should call simulation actions and navigate when template is applied', async () => {
    vi.useFakeTimers();
    render(
      <BrowserRouter>
        <TemplateBrowser />
      </BrowserRouter>
    );
    
    // Find the 'Bu Şablonu Kullan' button for the Ventilator
    const applyButtons = screen.getAllByText(/Bu Şablonu Kullan/i);
    fireEvent.click(applyButtons[applyButtons.length - 1]); // Last one is the Ventilator we added

    // Verify simulation calls
    expect(mockSetProfile).toHaveBeenCalled();
    expect(mockUpdateLayout).toHaveBeenCalled();
    expect(mockSetScenario).toHaveBeenCalled();

    // Advance timers for navigation
    vi.advanceTimersByTime(1000);
    expect(mockNavigate).toHaveBeenCalledWith('/');
    
    vi.useRealTimers();
  });
});
