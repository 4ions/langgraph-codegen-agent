import { Box, Button, Stack, Typography } from '@mui/material';
import { ArrowUpward as ArrowUpwardIcon, ArrowDownward as ArrowDownwardIcon } from '@mui/icons-material';

type SortBy = 'none' | 'year' | 'make';
type SortOrder = 'asc' | 'desc';

interface SortControlsProps {
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortByChange: (sortBy: SortBy) => void;
  onSortOrderChange: (sortOrder: SortOrder) => void;
}

/**
 * SortControls component that provides buttons for sorting cars by year or make.
 * Allows users to select sort field and toggle sort order (ascending/descending).
 */
export function SortControls({
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
}: SortControlsProps) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 1.5 }}>
        Sort by
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button
          variant={sortBy === 'year' ? 'contained' : 'outlined'}
          size="small"
          onClick={() => onSortByChange('year')}
        >
          Year
        </Button>
        <Button
          variant={sortBy === 'make' ? 'contained' : 'outlined'}
          size="small"
          onClick={() => onSortByChange('make')}
        >
          Make
        </Button>
        <Button
          variant={sortBy === 'none' ? 'contained' : 'outlined'}
          size="small"
          onClick={() => onSortByChange('none')}
        >
          None
        </Button>

        {sortBy !== 'none' && (
          <Button
            variant="outlined"
            size="small"
            startIcon={
              sortOrder === 'asc' ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />
            }
            onClick={() =>
              onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')
            }
          >
            {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          </Button>
        )}
      </Stack>
    </Box>
  );
}