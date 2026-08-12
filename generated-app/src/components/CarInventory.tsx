import { useState } from 'react';
import {
  Container,
  Grid,
  Stack,
  Typography,
  CircularProgress,
  Alert,
  Box,
} from '@mui/material';
import { useCars } from '@/hooks/useCars';
import { filterAndSortCars } from '@/utils/carFilters';
import { SearchBar } from './SearchBar';
import { SortControls } from './SortControls';
import { CarCard } from './CarCard';
import { AddCarForm } from './AddCarForm';

type SortBy = 'none' | 'year' | 'make';
type SortOrder = 'asc' | 'desc';

/**
 * CarInventory main component that integrates:
 * - useCars hook for fetching and managing car data
 * - SearchBar for filtering cars by model
 * - SortControls for sorting by year or make
 * - CarCard list for displaying filtered/sorted cars
 * - AddCarForm for adding new cars
 */
export function CarInventory() {
  const { cars, loading, error } = useCars();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('none');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Apply filtering and sorting to the cars list
  const filteredAndSortedCars = filterAndSortCars(cars, {
    modelSearch: searchTerm,
    sortBy,
    sortOrder,
  });

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={4}>
        {/* Header */}
        <Box>
          <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
            Car Inventory
          </Typography>
          <Typography variant="body1" color="textSecondary">
            Browse and manage your car collection
          </Typography>
        </Box>

        {/* Add Car Form */}
        <AddCarForm />

        {/* Search and Sort Controls */}
        <SearchBar value={searchTerm} onChange={setSearchTerm} />
        <SortControls
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortByChange={setSortBy}
          onSortOrderChange={setSortOrder}
        />

        {/* Loading State */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Error State */}
        {error && (
          <Alert severity="error">
            Failed to load cars. Please try again later.
          </Alert>
        )}

        {/* Empty State */}
        {!loading && !error && filteredAndSortedCars.length === 0 && (
          <Alert severity="info">
            {searchTerm
              ? 'No cars match your search. Try a different model name.'
              : 'No cars in inventory. Add one using the form above.'}
          </Alert>
        )}

        {/* Car Cards Grid */}
        {!loading && !error && filteredAndSortedCars.length > 0 && (
          <Grid container spacing={3}>
            {filteredAndSortedCars.map((car) => (
              <Grid item xs={12} sm={6} md={4} key={car.id}>
                <CarCard car={car} />
              </Grid>
            ))}
          </Grid>
        )}
      </Stack>
    </Container>
  );
}