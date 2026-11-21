import { render, screen } from '@testing-library/react';

import { MpAmount } from './mp-amount';

describe('MpAmount', () => {
  it('formats 1250 as "1,250" with an MP tag', () => {
    render(<MpAmount value={1250} />);
    expect(screen.getByText('1,250')).toBeInTheDocument();
    expect(screen.getByText('MP')).toBeInTheDocument();
  });
});
