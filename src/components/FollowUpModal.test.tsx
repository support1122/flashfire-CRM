import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FollowUpModal from './FollowUpModal';

vi.mock('../context/PlanConfigContext', () => ({
  usePlanConfig: () => ({
    planOptions: [
      { key: 'PRIME', label: 'PRIME', price: 99, displayPrice: '$99', currency: 'USD' },
      { key: 'IGNITE', label: 'IGNITE', price: 199, displayPrice: '$199', currency: 'USD' },
      { key: 'PROFESSIONAL', label: 'PROFESSIONAL', price: 349, displayPrice: '$349', currency: 'USD' },
      { key: 'EXECUTIVE', label: 'EXECUTIVE', price: 599, displayPrice: '$599', currency: 'USD' },
    ],
  }),
}));

const props = { isOpen: true, onClose: vi.fn(), clientName: 'Asha', clientEmail: 'a@x.test' };

describe('FollowUpModal package', () => {
  it('offers the four website plans and starts with nothing chosen', () => {
    render(<FollowUpModal {...props} onSchedule={vi.fn()} />);
    const select = screen.getByLabelText(/package/i) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'PRIME', 'IGNITE', 'PROFESSIONAL', 'EXECUTIVE']);
    expect(select.value).toBe('');
  });

  it('sends the chosen package with the follow-up date', async () => {
    const onSchedule = vi.fn().mockResolvedValue(undefined);
    render(<FollowUpModal {...props} onSchedule={onSchedule} />);
    fireEvent.change(screen.getByLabelText(/package/i), { target: { value: 'EXECUTIVE' } });
    fireEvent.click(screen.getByRole('button', { name: /schedule follow-up/i }));
    await waitFor(() => expect(onSchedule).toHaveBeenCalledTimes(1));
    expect(onSchedule.mock.calls[0][0]).toMatchObject({ plan: 'EXECUTIVE' });
    expect(typeof onSchedule.mock.calls[0][0].followUpDateTime).toBe('string');
  });

  it('blocks scheduling until a package is chosen, and pre-selects an existing one', async () => {
    const onSchedule = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<FollowUpModal {...props} onSchedule={onSchedule} />);
    const button = screen.getByRole('button', { name: /schedule follow-up/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSchedule).not.toHaveBeenCalled();
    unmount();
    render(<FollowUpModal {...props} initialPlan="IGNITE" onSchedule={onSchedule} />);
    expect((screen.getByLabelText(/package/i) as HTMLSelectElement).value).toBe('IGNITE');
    expect((screen.getByRole('button', { name: /schedule follow-up/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});
