import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CarCard } from '@/components/CarCard';
import type { Car } from '@/types';

// Mock ResponsiveCarImage to avoid media query complexity in unit tests
vi.mock('@/components/ResponsiveCarImage', () => ({
  ResponsiveCarImage: ({ car, alt }: { car: Car; alt?: string }) => (
    <img src={car.desktop} alt={alt || `${car.make} ${car.model}`} data-testid="responsive-car-image" />
  ),
}));

const mockCar: Car = {
  id: '1',
  make: 'Toyota',
  model: 'Camry',
  year: 2024,
  color: 'Silver',
  mobile: 'https://placehold.co/320x180',
  tablet: 'https://placehold.co/640x360',
  desktop: 'https://placehold.co/1440x810',
};

describe('CarCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders car make and model as heading', () => {
    render(<CarCard car={mockCar} />);
    expect(screen.getByText('Toyota Camry')).toBeInTheDocument();
  });

  it('renders car year', () => {
    render(<CarCard car={mockCar} />);
    expect(screen.getByText('2024')).toBeInTheDocument();
  });

  it('renders car color', () => {
    render(<CarCard car={mockCar} />);
    expect(screen.getByText('Silver')).toBeInTheDocument();
  });

  it('renders Year label', () => {
    render(<CarCard car={mockCar} />);
    expect(screen.getByText('Year')).toBeInTheDocument();
  });

  it('renders Color label', () => {
    render(<CarCard car={mockCar} />);
    expect(screen.getByText('Color')).toBeInTheDocument();
  });

  it('renders responsive car image with correct src', () => {
    render(<CarCard car={mockCar} />);
    const img = screen.getByTestId('responsive-car-image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', mockCar.desktop);
  });

  it('renders responsive car image with correct alt text', () => {
    render(<CarCard car={mockCar} />);
    const img = screen.getByTestId('responsive-car-image');
    expect(img).toHaveAttribute('alt', 'Toyota Camry');
  });

  it('renders different car data correctly', () => {
    const differentCar: Car = {
      id: '2',
      make: 'Honda',
      model: 'Civic',
      year: 2023,
      color: 'Blue',
      mobile: 'https://placehold.co/320x180',
      tablet: 'https://placehold.co/640x360',
      desktop: 'https://placehold.co/1440x810',
    };
    render(<CarCard car={differentCar} />);
    expect(screen.getByText('Honda Civic')).toBeInTheDocument();
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();
  });

  it('renders all car details in correct layout structure', () => {
    const { container } = render(<CarCard car={mockCar} />);
    const cardContent = container.querySelector('[class*="MuiCardContent"]');
    expect(cardContent).toBeInTheDocument();
    expect(cardContent).toHaveTextContent('Toyota Camry');
    expect(cardContent).toHaveTextContent('2024');
    expect(cardContent).toHaveTextContent('Silver');
  });
});
