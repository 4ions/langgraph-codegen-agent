import {
  Card,
  CardContent,
  CardMedia,
  Typography,
  Stack,
  Box,
} from '@mui/material';
import { ResponsiveCarImage } from './ResponsiveCarImage';
import type { Car } from '@/types';

interface CarCardProps {
  car: Car;
}

/**
 * CarCard component that displays car details (make, model, year, color)
 * in an MUI Card with ResponsiveCarImage.
 */
export function CarCard({ car }: CarCardProps) {
  return (
    <Card elevation={2}>
      <Box sx={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
        <CardMedia sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
          <ResponsiveCarImage car={car} />
        </CardMedia>
      </Box>
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="h6" component="div">
            {car.make} {car.model}
          </Typography>
          <Stack direction="row" spacing={2}>
            <Box>
              <Typography variant="body2" color="textSecondary">
                Year
              </Typography>
              <Typography variant="body1">{car.year}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="textSecondary">
                Color
              </Typography>
              <Typography variant="body1">{car.color}</Typography>
            </Box>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}