import { TextField, Box } from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * SearchBar component that provides a text input for model search.
 * Integrates with MUI TextField and displays a search icon.
 */
export function SearchBar({
  value,
  onChange,
  placeholder = 'Search by model...',
}: SearchBarProps) {
  return (
    <Box sx={{ mb: 3 }}>
      <TextField
        fullWidth
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
                <SearchIcon />
              </Box>
            ),
          },
        }}
        variant="outlined"
        size="medium"
      />
    </Box>
  );
}