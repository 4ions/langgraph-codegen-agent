import React, { useState } from 'react';
import {
  Button,
  Stack,
  TextField,
  Typography,
  Card,
  CardContent,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

interface YearFilterProps {
  onYearChange: (year: number | null) => void;
  selectedYear: number | null;
  minYear?: number;
  maxYear?: number;
}

/**
 * YearFilter component that allows filtering cars by a specific year.
 * Provides input field for year selection and a clear button to reset the filter.
 */
export function YearFilter({
  onYearChange,
  selectedYear,
  minYear = 1900,
  maxYear = new Date().getFullYear() + 1,
}: YearFilterProps) {
  const [inputValue, setInputValue] = useState<string>(
    selectedYear ? String(selectedYear) : ''
  );
  const [error, setError] = useState<string | null>(null);

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    setError(null);

    if (value === '') {
      onYearChange(null);
      return;
    }

    const year = parseInt(value, 10);

    if (isNaN(year)) {
      setError('Please enter a valid year');
      return;
    }

    if (year < minYear || year > maxYear) {
      setError(`Year must be between ${minYear} and ${maxYear}`);
      return;
    }

    onYearChange(year);
  };

  const handleClear = () => {
    setInputValue('');
    setError(null);
    onYearChange(null);
  };

  return (
    <Card elevation={1}>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Filter by Year
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <TextField
              type="number"
              label="Year"
              value={inputValue}
              onChange={handleYearChange}
              error={!!error}
              helperText={error}
              inputProps={{
                min: minYear,
                max: maxYear,
              }}
              variant="outlined"
              size="small"
              sx={{ width: '120px' }}
            />
            {selectedYear !== null && (
              <Button
                variant="outlined"
                size="small"
                onClick={handleClear}
                startIcon={<CloseIcon />}
                sx={{ mt: 0.5 }}
              >
                Clear
              </Button>
            )}
          </Stack>
          {selectedYear !== null && (
            <Typography variant="body2" color="primary">
              Filtering by year: {selectedYear}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}