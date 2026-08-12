import { describe, it, expect } from 'vitest';
import type { Car } from '@/types';
import {
  filterCarsByModel,
  sortCarsByYear,
  sortCarsByMake,
  filterAndSortCars,
} from '@/utils/carFilters';

const mockCars: Car[] = [
  {
    id: '1',
    make: 'Toyota',
    model: 'Camry',
    year: 2024,
    color: 'Silver',
    mobile: 'https://placehold.co/64',
    tablet: 'https://placehold.co/512',
    desktop: 'https://placehold.co/1024',
  },
  {
    id: '2',
    make: 'Honda',
    model: 'Civic',
    year: 2022,
    color: 'Blue',
    mobile: 'https://placehold.co/64',
    tablet: 'https://placehold.co/512',
    desktop: 'https://placehold.co/1024',
  },
  {
    id: '3',
    make: 'Ford',
    model: 'Mustang',
    year: 2023,
    color: 'Red',
    mobile: 'https://placehold.co/64',
    tablet: 'https://placehold.co/512',
    desktop: 'https://placehold.co/1024',
  },
  {
    id: '4',
    make: 'BMW',
    model: 'X5',
    year: 2021,
    color: 'Black',
    mobile: 'https://placehold.co/64',
    tablet: 'https://placehold.co/512',
    desktop: 'https://placehold.co/1024',
  },
  {
    id: '5',
    make: 'Toyota',
    model: 'Corolla',
    year: 2023,
    color: 'White',
    mobile: 'https://placehold.co/64',
    tablet: 'https://placehold.co/512',
    desktop: 'https://placehold.co/1024',
  },
];

describe('filterCarsByModel', () => {
  it('should return all cars when search term is empty', () => {
    const result = filterCarsByModel(mockCars, '');
    expect(result).toEqual(mockCars);
  });

  it('should return all cars when search term is whitespace', () => {
    const result = filterCarsByModel(mockCars, '   ');
    expect(result).toEqual(mockCars);
  });

  it('should filter cars by model (case-insensitive)', () => {
    const result = filterCarsByModel(mockCars, 'camry');
    expect(result).toHaveLength(1);
    expect(result[0]!.model).toBe('Camry');
  });

  it('should filter cars by partial model match', () => {
    const result = filterCarsByModel(mockCars, 'a');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((car) => car.model.toLowerCase().includes('a'))).toBe(
      true
    );
  });

  it('should return empty array when no cars match', () => {
    const result = filterCarsByModel(mockCars, 'NonExistent');
    expect(result).toHaveLength(0);
  });

  it('should handle empty cars array', () => {
    const result = filterCarsByModel([], 'Camry');
    expect(result).toHaveLength(0);
  });
});

describe('sortCarsByYear', () => {
  it('should sort cars by year in ascending order by default', () => {
    const result = sortCarsByYear(mockCars);
    expect(result[0]!.year).toBeLessThanOrEqual(result[1]!.year);
    expect(result[result.length - 1]!.year).toBeGreaterThanOrEqual(
      result[result.length - 2]!.year
    );
  });

  it('should sort cars by year in ascending order', () => {
    const result = sortCarsByYear(mockCars, 'asc');
    expect(result[0]!.year).toBeLessThanOrEqual(result[1]!.year);
    expect(result[result.length - 1]!.year).toBeGreaterThanOrEqual(
      result[result.length - 2]!.year
    );
  });

  it('should sort cars by year in descending order', () => {
    const result = sortCarsByYear(mockCars, 'desc');
    expect(result[0]!.year).toBeGreaterThanOrEqual(result[1]!.year);
    expect(result[result.length - 1]!.year).toBeLessThanOrEqual(
      result[result.length - 2]!.year
    );
  });

  it('should not mutate the original array', () => {
    const original = [...mockCars];
    sortCarsByYear(mockCars, 'asc');
    expect(mockCars).toEqual(original);
  });

  it('should handle empty cars array', () => {
    const result = sortCarsByYear([]);
    expect(result).toHaveLength(0);
  });

  it('should handle single car', () => {
    const result = sortCarsByYear([mockCars[0]!]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(mockCars[0]);
  });
});

describe('sortCarsByMake', () => {
  it('should sort cars by make in ascending order by default', () => {
    const result = sortCarsByMake(mockCars);
    expect(result[0]).toBeDefined();
    expect(result[1]).toBeDefined();
    expect(result[0]!.make.localeCompare(result[1]!.make)).toBeLessThanOrEqual(
      0
    );
  });

  it('should sort cars by make in descending order', () => {
    const result = sortCarsByMake(mockCars, 'desc');
    expect(result[0]).toBeDefined();
    expect(result[1]).toBeDefined();
    expect(
      result[0]!.make.localeCompare(result[1]!.make)
    ).toBeGreaterThanOrEqual(0);
  });

  it('should not mutate the original array', () => {
    const original = [...mockCars];
    sortCarsByMake(mockCars, 'asc');
    expect(mockCars).toEqual(original);
  });

  it('should handle empty cars array', () => {
    const result = sortCarsByMake([]);
    expect(result).toHaveLength(0);
  });

  it('should handle single car', () => {
    const result = sortCarsByMake([mockCars[0]!]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(mockCars[0]);
  });
});

describe('filterAndSortCars', () => {
  it('should return all cars when no options are provided', () => {
    const result = filterAndSortCars(mockCars);
    expect(result).toEqual(mockCars);
  });

  it('should filter by model search', () => {
    const result = filterAndSortCars(mockCars, { modelSearch: 'Camry' });
    expect(result).toHaveLength(1);
    expect(result[0]!.model).toBe('Camry');
  });

  it('should sort by year when sortBy is year', () => {
    const result = filterAndSortCars(mockCars, {
      sortBy: 'year',
      sortOrder: 'asc',
    });
    expect(result[0]!.year).toBeLessThanOrEqual(result[1]!.year);
  });

  it('should sort by make when sortBy is make', () => {
    const result = filterAndSortCars(mockCars, {
      sortBy: 'make',
      sortOrder: 'asc',
    });
    expect(result[0]).toBeDefined();
    expect(result[1]).toBeDefined();
    expect(result[0]!.make.localeCompare(result[1]!.make)).toBeLessThanOrEqual(
      0
    );
  });

  it('should apply filter before sort', () => {
    const options = {
      modelSearch: 'a',
      sortBy: 'year' as const,
      sortOrder: 'desc' as const,
    };
    const result = filterAndSortCars(mockCars, options);
    const filtered = filterCarsByModel(mockCars, 'a');
    const sorted = sortCarsByYear(filtered, 'desc');
    expect(result).toEqual(sorted);
  });

  it('should not mutate the original array', () => {
    const original = [...mockCars];
    filterAndSortCars(mockCars, {
      modelSearch: 'Camry',
      sortBy: 'year',
    });
    expect(mockCars).toEqual(original);
  });

  it('should handle empty cars array', () => {
    const result = filterAndSortCars([], {
      modelSearch: 'Camry',
      sortBy: 'year',
    });
    expect(result).toHaveLength(0);
  });
});
