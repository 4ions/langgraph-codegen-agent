import { useState, useMemo } from 'react';
import { filterAndSortCars } from '@/utils/carFilters';
import type { Car } from '@/types';

type SortBy = 'none' | 'year' | 'make';
type SortOrder = 'asc' | 'desc';

interface UseCarFiltersOptions {
  initialSearchTerm?: string;
  initialSortBy?: SortBy;
  initialSortOrder?: SortOrder;
  initialYearFilter?: number | null;
}

interface UseCarFiltersReturn {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  sortBy: SortBy;
  setSortBy: (sortBy: SortBy) => void;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
  yearFilter: number | null;
  setYearFilter: (year: number | null) => void;
  filteredAndSortedCars: Car[];
}

/**
 * useCarFilters custom hook that combines search, sort, and optional year filter logic.
 * Manages filter state and applies filtering/sorting to a provided car array.
 *
 * @param cars - Array of cars to filter and sort
 * @param options - Optional configuration for initial state
 * @returns Object containing filter state, setters, and filtered/sorted cars array
 */
export function useCarFilters(
  cars: Car[],
  options: UseCarFiltersOptions = {}
): UseCarFiltersReturn {
  const {
    initialSearchTerm = '',
    initialSortBy = 'none',
    initialSortOrder = 'asc',
    initialYearFilter = null,
  } = options;

  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [sortBy, setSortBy] = useState<SortBy>(initialSortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder);
  const [yearFilter, setYearFilter] = useState<number | null>(initialYearFilter);

  const filteredAndSortedCars = useMemo(() => {
    let result = cars;

    // Apply year filter if set
    if (yearFilter !== null) {
      result = result.filter((car) => car.year === yearFilter);
    }

    // Apply search and sort filters
    result = filterAndSortCars(result, {
      modelSearch: searchTerm,
      sortBy,
      sortOrder,
    });

    return result;
  }, [cars, searchTerm, sortBy, sortOrder, yearFilter]);

  return {
    searchTerm,
    setSearchTerm,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    yearFilter,
    setYearFilter,
    filteredAndSortedCars,
  };
}