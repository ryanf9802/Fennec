import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireSetup } from '../src/app/RequireSetup';

const mocks = vi.hoisted(() => ({
  state: 'checking' as 'checking' | 'complete',
}));

vi.mock('../src/setup/SetupStatusContext', () => ({
  useSetupStatus: () => ({ state: mocks.state }),
}));

function ProtectedRoute() {
  return (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<RequireSetup />}>
          <Route path="/" element={<div>Protected content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('setup route guard', () => {
  beforeEach(() => {
    mocks.state = 'checking';
  });

  it('renders no intermediate setup screen while readiness is checking', () => {
    render(<ProtectedRoute />);

    expect(screen.queryByText('Checking setup…')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders protected routes after setup is complete', () => {
    mocks.state = 'complete';
    render(<ProtectedRoute />);

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});
