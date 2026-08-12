import type { Car } from '@/types';

/**
 * Filters cars by model search term (case-insensitive partial match)
 * @param cars - Array of cars to filter
 * @param searchTerm - Search term to match against car models
 * @returns Filtered array of cars matching the search term
 */
export function filterCarsByModel(cars: Car[], searchTerm: string): Car[] {
  if (!searchTerm.trim()) {
    return cars;
  }

  const lowerSearchTerm = searchTerm.toLowerCase();
  return cars.filter((car) =>
    car.model.toLowerCase().includes(lowerSearchTerm)
  );
}

/**
 * Sorts cars by year in ascending or descending order
 * @param cars - Array of cars to sort
 * @param order - Sort order: 'asc' for ascending (oldest first), 'desc' for descending (newest first)
 * @returns Sorted array of cars
 */
export function sortCarsByYear(
  cars: Car[],
  order: 'asc' | 'desc' = 'asc'
): Car[] {
  const sorted = [...cars];
  sorted.sort((a, b) => {
    if (order === 'asc') {
      return a.year - b.year;
    }
    return b.year - a.year;
  });
  return sorted;
}

/**
 * Sorts cars by make in alphabetical order
 * @param cars - Array of cars to sort
 * @param order - Sort order: 'asc' for ascending (A-Z), 'desc' for descending (Z-A)
 * @returns Sorted array of cars
 */
export function sortCarsByMake(
  cars: Car[],
  order: 'asc' | 'desc' = 'asc'
): Car[] {
  const sorted = [...cars];
  sorted.sort((a, b) => {
    if (order === 'asc') {
      return a.make.localeCompare(b.make);
    }
    return b.make.localeCompare(a.make);
  });
  return sorted;
}

/**
 * Options for filtering and sorting cars
 */
export interface FilterSortOptions {
  modelSearch?: string;
  sortBy?: 'year' | 'make' | 'none';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Filters and sorts cars based on provided options
 * @param cars - Array of cars to filter and sort
 * @param options - Filter and sort options
 * @returns Filtered and sorted array of cars
 */
export function filterAndSortCars(
  cars: Car[],
  options: FilterSortOptions = {}
): Car[] {
  const { modelSearch = '', sortBy = 'none', sortOrder = 'asc' } = options;

  let result = cars;

  // Apply filtering
  if (modelSearch) {
    result = filterCarsByModel(result, modelSearch);
  }

  // Apply sorting
  if (sortBy === 'year') {
    result = sortCarsByYear(result, sortOrder);
  } else if (sortBy === 'make') {
    result = sortCarsByMake(result, sortOrder);
  }

  return result;
}