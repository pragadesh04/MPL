import { render, screen } from '@testing-library/react';

import { Button } from './button';

describe('Button', () => {
  it('defaults to type="button"', () => {
    render(<Button>Bid</Button>);
    expect(screen.getByRole('button', { name: 'Bid' })).toHaveAttribute('type', 'button');
  });

  it('keeps an explicit type', () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit');
  });

  it('renders the child element with asChild and no type attribute', () => {
    render(
      <Button asChild>
        <a href="/auction">Join auction</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Join auction' });
    expect(link).not.toHaveAttribute('type');
    expect(link).toHaveAttribute('data-slot', 'button');
  });
});
