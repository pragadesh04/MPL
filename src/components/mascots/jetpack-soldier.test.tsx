import { render, screen } from '@testing-library/react';

import { JetpackSoldier } from './jetpack-soldier';

describe('JetpackSoldier', () => {
  it('renders an accessible img when given a title', () => {
    render(<JetpackSoldier title="MPL soldier" pose="flying" />);
    expect(screen.getByRole('img', { name: 'MPL soldier' })).toBeInTheDocument();
  });

  it('is hidden from assistive tech without a title', () => {
    const { container } = render(<JetpackSoldier />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
