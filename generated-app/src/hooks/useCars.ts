import { useQuery, useMutation } from '@apollo/client';
import { GET_CARS, ADD_CAR } from '@/graphql/queries';
import type { Car } from '@/types';

interface AddCarInput {
  make: string;
  model: string;
  year: number;
  color: string;
}

interface GetCarsData {
  cars: Car[];
}

interface AddCarData {
  addCar: Car;
}

interface AddCarVariables extends AddCarInput {}

export function useCars() {
  const { data, loading, error, refetch } = useQuery<GetCarsData>(GET_CARS);

  const [addCarMutation, { loading: addingCar, error: addCarError }] =
    useMutation<AddCarData, AddCarVariables>(ADD_CAR, {
      update(cache, { data: mutationData }) {
        if (!mutationData?.addCar) return;

        const existingData = cache.readQuery<GetCarsData>({
          query: GET_CARS,
        });

        if (existingData) {
          cache.writeQuery<GetCarsData>({
            query: GET_CARS,
            data: {
              cars: [...existingData.cars, mutationData.addCar],
            },
          });
        }
      },
    });

  const addCar = async (input: AddCarInput): Promise<Car | null> => {
    try {
      const result = await addCarMutation({
        variables: input,
      });
      return result.data?.addCar ?? null;
    } catch (err) {
      console.error('Error adding car:', err);
      throw err;
    }
  };

  return {
    cars: data?.cars ?? [],
    loading,
    error,
    addCar,
    addingCar,
    addCarError,
    refetch,
  };
}
