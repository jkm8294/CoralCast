import { Region } from '../types/coral';

export const REGIONS: Region[] = [
  {
    id: 'puerto-rico',
    name: 'Puerto Rico',
    centroid: [18.2208, -66.5901],
    bbox: [[17.9, -67.3], [18.5, -65.2]],
    reefs: [
      {
        id: 'pr-desecheo',
        name: 'Desecheo National Wildlife Refuge',
        coordinates: [18.3822, -67.4838],
        status: 'warning',
        description: 'Offshore reef with moderate bleaching stress.'
      },
      {
        id: 'pr-la-parguera',
        name: 'La Parguera Reefs',
        coordinates: [17.9565, -67.0464],
        status: 'good',
        description: 'Fringing reefs with improving conditions.'
      },
      {
        id: 'pr-vieques',
        name: 'Vieques Coral Gardens',
        coordinates: [18.115, -65.394],
        status: 'alert',
        description: 'Shallow reef sites experiencing active bleaching.'
      },
      {
        id: 'pr-culebra',
        name: 'Culebra Luis Peña Reserve',
        coordinates: [18.3145, -65.345],
        status: 'warning',
        description: 'Eastern Puerto Rico reef tract influenced by Virgin Passage currents.'
      },
      {
        id: 'pr-mayaguez',
        name: 'Mayagüez Shelf Edge',
        coordinates: [18.19, -67.19],
        status: 'good',
        description: 'Shelf-edge reef complex near the Mona Passage.'
      }
    ]
  },
  {
    id: 'miami',
    name: 'Miami / Biscayne',
    centroid: [25.7617, -80.1918],
    bbox: [[25.4, -80.5], [26.1, -79.9]],
    reefs: [
      {
        id: 'miami-fowey',
        name: 'Fowey Rocks Reef',
        coordinates: [25.5915, -80.0972],
        status: 'good',
        description: 'Iconic offshore reef in Biscayne National Park.'
      },
      {
        id: 'miami-biscayne',
        name: 'Biscayne Reef Tract',
        coordinates: [25.455, -80.15],
        status: 'warning',
        description: 'Patch reefs adjacent to Biscayne Bay.'
      },
      {
        id: 'miami-elbow',
        name: 'Elbow Reef',
        coordinates: [25.0338, -80.3744],
        status: 'good',
        description: 'Popular dive reef near Key Largo with resilient coral cover.'
      },
      {
        id: 'miami-lagoon',
        name: 'Featherbed Bank',
        coordinates: [25.378, -80.271],
        status: 'warning',
        description: 'Inshore patch reefs near Biscayne Bay influenced by freshwater pulses.'
      },
      {
        id: 'miami-dry-rocks',
        name: 'Key Largo Dry Rocks',
        coordinates: [25.115, -80.297],
        status: 'good',
        description: 'Iconic dive site hosting the Christ of the Abyss statue.'
      }
    ]
  }
];
