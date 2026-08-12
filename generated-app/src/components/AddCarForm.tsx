import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Stack,
  TextField,
  Button,
  Typography,
  Alert,
} from '@mui/material';
import { useCars } from '@/hooks/useCars';

interface AddCarFormProps {
  onSuccess?: () => void;
}

/**
 * AddCarForm component that provides a form to add a new car.
 * Includes fields for make, model, year, and color.
 * Submits the AddCar mutation via useCars hook.
 */
export function AddCarForm({ onSuccess }: AddCarFormProps) {
  const { addCar, addingCar, addCarError } = useCars();
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    make: '',
    model: '',
    year: new Date().getFullYear(),
    color: '',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'year' ? parseInt(value, 10) : value,
    }));
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    // Validate form
    if (!formData.make.trim()) {
      setFormError('Make is required');
      return;
    }
    if (!formData.model.trim()) {
      setFormError('Model is required');
      return;
    }
    if (!formData.year || formData.year < 1900 || formData.year > 2100) {
      setFormError('Year must be between 1900 and 2100');
      return;
    }
    if (!formData.color.trim()) {
      setFormError('Color is required');
      return;
    }

    try {
      await addCar({
        make: formData.make.trim(),
        model: formData.model.trim(),
        year: formData.year,
        color: formData.color.trim(),
      });

      // Reset form on success
      setFormData({
        make: '',
        model: '',
        year: new Date().getFullYear(),
        color: '',
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error('Failed to add car:', err);
      setFormError('Failed to add car. Please try again.');
    }
  };

  return (
    <Card elevation={2}>
      <CardContent>
        <Stack spacing={3} component="form" onSubmit={handleSubmit}>
          <Typography variant="h6" component="div">
            Add New Car
          </Typography>

          {(formError || addCarError) && (
            <Alert severity="error">
              {formError || 'An error occurred while adding the car'}
            </Alert>
          )}

          <TextField
            fullWidth
            label="Make"
            name="make"
            value={formData.make}
            onChange={handleChange}
            placeholder="e.g., Toyota"
            variant="outlined"
            disabled={addingCar}
          />

          <TextField
            fullWidth
            label="Model"
            name="model"
            value={formData.model}
            onChange={handleChange}
            placeholder="e.g., Camry"
            variant="outlined"
            disabled={addingCar}
          />

          <TextField
            fullWidth
            label="Year"
            name="year"
            type="number"
            value={formData.year}
            onChange={handleChange}
            variant="outlined"
            inputProps={{ min: 1900, max: 2100 }}
            disabled={addingCar}
          />

          <TextField
            fullWidth
            label="Color"
            name="color"
            value={formData.color}
            onChange={handleChange}
            placeholder="e.g., Silver"
            variant="outlined"
            disabled={addingCar}
          />

          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={addingCar}
            sx={{ mt: 1 }}
          >
            {addingCar ? 'Adding...' : 'Add Car'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}