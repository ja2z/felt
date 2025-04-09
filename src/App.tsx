import { useMemo, useEffect } from "react";
import FeltMapComponent from "./components/FeltMapComponent";
import "./App.css";
import {
  client,
  useConfig,
  useElementData,
  useElementColumns,
} from "@sigmacomputing/plugin";

// Configure the editor panel with relevant options for the Felt map
client.config.configureEditorPanel([
  { name: "source", type: "element" },
  { name: "latitudeColumn", type: "column", source: "source", allowMultiple: false },
  { name: "longitudeColumn", type: "column", source: "source", allowMultiple: false },
  { name: "labelColumn", type: "column", source: "source", allowMultiple: false },
  { name: "sizeColumn", type: "column", source: "source", allowMultiple: false },
  { name: "colorColumn", type: "column", source: "source", allowMultiple: false },
  { name: "mapId", type: "text", defaultValue: "xw9BxV0EmdR2u5C4AyrTke9CB" },
  { name: "title", type: "text", defaultValue: "Felt Map" },
  { name: "showSidebar", type: "checkbox", defaultValue: true },
  { name: "showLegend", type: "checkbox", defaultValue: true },
  {
    name: "containerPadding",
    type: "dropdown",
    values: ["0rem", "1rem", "2rem", "3rem"],
    defaultValue: "0rem"
  },
]);

// Interface for extended column information
interface ExtendedColumnInfo extends Record<string, any> {
  name: string;
  columnType: string;
  format?: {
    format: string;
  };
}

// Interface for map point data
interface MapPoint {
  latitude: number;
  longitude: number;
  label?: string;
  size?: number;
  color?: string;
}

function App() {
  const config = useConfig();
  const sigmaData = useElementData(config.source);
  // Cast columnInfo to use our extended type
  const columnInfo = useElementColumns(config.source) as Record<string, ExtendedColumnInfo>;
  
  // Get configuration values from the editor panel
  const title = (client.config.getKey as any)("title") as string;
  const mapId = (client.config.getKey as any)("mapId") as string;
  const showSidebar = (client.config.getKey as any)("showSidebar") as boolean;
  const showLegend = (client.config.getKey as any)("showLegend") as boolean;
  const containerPadding = (client.config.getKey as any)("containerPadding") as string;
  
  // Get column configurations
  const { latitudeColumn, longitudeColumn, labelColumn, sizeColumn, colorColumn } = config;

  // Add useEffect to dynamically update the root padding
  useEffect(() => {
    const root = document.getElementById('root');
    if (root) {
      root.style.padding = containerPadding;
    }
  }, [containerPadding]);

  // Transform Sigma data into map points
  const mapPoints = useMemo(() => {
    // Safety check: ensure required data and columns are present
    if (!sigmaData || !columnInfo || !latitudeColumn || !longitudeColumn) {
      return [];
    }

    // Get data for the required columns
    const latData = sigmaData[latitudeColumn];
    const lngData = sigmaData[longitudeColumn];

    // Safety check: ensure latitude and longitude columns have data
    if (!latData || !lngData || !Array.isArray(latData) || !Array.isArray(lngData)) {
      return [];
    }

    // Get data for optional columns if they exist
    const labelData = labelColumn ? sigmaData[labelColumn] : null;
    const sizeData = sizeColumn ? sigmaData[sizeColumn] : null;
    const colorData = colorColumn ? sigmaData[colorColumn] : null;

    // Determine number of rows from latitude column
    const numRows = latData.length;

    // Create an array of point objects
    return Array.from({ length: numRows }, (_, rowIndex) => {
      // Get latitude and longitude values
      const latitude = latData[rowIndex];
      const longitude = lngData[rowIndex];

      // Skip invalid coordinates
      if (typeof latitude !== 'number' || typeof longitude !== 'number' || 
          isNaN(latitude) || isNaN(longitude)) {
        return null;
      }

      // Initialize the point object with required properties
      const point: MapPoint = {
        latitude,
        longitude
      };

      // Add optional properties if they exist
      if (labelData && labelData[rowIndex] !== undefined) {
        point.label = String(labelData[rowIndex]);
      }

      if (sizeData && typeof sizeData[rowIndex] === 'number') {
        // Normalize size values to a reasonable range (1-15)
        point.size = sizeData[rowIndex];
      }

      if (colorData && colorData[rowIndex] !== undefined) {
        point.color = String(colorData[rowIndex]);
      }

      return point;
    }).filter(point => point !== null) as MapPoint[];
  }, [sigmaData, columnInfo, latitudeColumn, longitudeColumn, labelColumn, sizeColumn, colorColumn]);

  return (
    <div className="felt-map-container">
      {mapPoints.length > 0 ? (
        <FeltMapComponent
          mapId={mapId}
          title={title}
          points={mapPoints}
          showSidebar={showSidebar}
          showLegend={showLegend}
        />
      ) : (
        <div className="felt-loading-message">
          <p>Please select data source columns for latitude and longitude in the editor panel.</p>
        </div>
      )}
    </div>
  );
}

export default App;