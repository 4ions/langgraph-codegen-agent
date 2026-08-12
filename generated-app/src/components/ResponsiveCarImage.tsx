import { Box } from '@mui/material';
import { useTheme, useMediaQuery } from '@mui/material';
import type { Car } from '@/types';

interface ResponsiveCarImageProps {
  car: Car;
  alt?: string;
}

/**
 * ResponsiveCarImage component that renders the appropriate car image
 * based on the current viewport breakpoint:
 * - mobile (≤640px): uses car.mobile
 * - tablet (641-1023px): uses car.tablet
 * - desktop (≥1024px): uses car.desktop
 */
export function ResponsiveCarImage({
  car,
  alt = `${car.make} ${car.model}`,
}: ResponsiveCarImageProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'));
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  let imageSrc = car.desktop;

  if (isMobile) {
    imageSrc = car.mobile;
  } else if (isTablet) {
    imageSrc = car.tablet;
  } else if (isDesktop) {
    imageSrc = car.desktop;
  }

  return (
    <Box
      component="img"
      src={imageSrc}
      alt={alt}
      sx={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
      }}
    />
  );
}