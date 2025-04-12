import { useState, useEffect, useRef } from "react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Felt, FeltController, FeltEmbedOptions } from "@feltmaps/js-sdk";

// Interface for points to display on the map
interface MapPoint {
  latitude: number;
  longitude: number;
  label?: string;
  size?: number;
  color?: string;
}

// Component props
interface FeltMapComponentProps {
  mapId: string;
  title: string;
  points: MapPoint[];
  showSidebar?: boolean;
  showLegend?: boolean;
  columnLookup?: Record<string, string>; // Add this prop
}

// Predefined color palette for categorical values
const COLOR_PALETTE = [
  "#4c78a8", // blue
  "#f58518", // orange
  "#e45756", // red
  "#72b7b2", // teal
  "#54a24b", // green
  "#eeca3b", // yellow
  "#b279a2", // purple
  "#ff9da6", // pink
  "#9d755d", // brown
  "#bab0ac", // gray
];

export default function FeltMapComponent({
  mapId,
  title,
  points,
  showSidebar = true,
  showLegend = false,
  columnLookup = {},
}: FeltMapComponentProps) {
  const [felt, setFelt] = useState<FeltController | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);

  // Helper function to get color for a category
  const getCategoryColor = (category: string | undefined): string => {
    if (!category) return COLOR_PALETTE[0];
    // Find the index of this category in the unique values
    const uniqueValues = Array.from(
      new Set(points.map((point) => point.color).filter((c) => c !== undefined))
    );
    const categoryIndex = uniqueValues.indexOf(category);
    if (categoryIndex === -1) return COLOR_PALETTE[0];
    return COLOR_PALETTE[categoryIndex % COLOR_PALETTE.length];
  };

  // Initialize Felt map
  useEffect(() => {
    async function loadFelt() {
      if (hasLoadedRef.current || !mapRef.current) return;

      hasLoadedRef.current = true;
      setIsLoading(true);

      try {
        // Configure Felt embed options
        const embedOptions: FeltEmbedOptions = {
          uiControls: {
            cooperativeGestures: false,
            fullScreenButton: false,
            showLegend: showLegend,
          },
        };

        // Create the Felt map instance
        const feltInstance = await Felt.embed(mapRef.current, mapId, embedOptions);
        setFelt(feltInstance);
        setIsLoading(false);
      } catch (error) {
        console.error("Error loading Felt map:", error);
        setIsLoading(false);
      }
    }

    loadFelt();

    // No specific cleanup needed as Felt handles this internally
    return () => {
      // The iframe is automatically removed when the component unmounts
    };
  }, [mapId, showLegend]);

  // Convert points to GeoJSON and add to map when they change or when the map is ready
  useEffect(() => {
    async function addPointsToMap() {
      if (!felt || !points.length) return;

      try {
        // Get all unique color categories to use for styling
        const uniqueCategories = Array.from(new Set(points.map((point) => point.color).filter(Boolean)));

        // Determine if we should use dynamic sizing
        const hasSizeData = points.some((point) => point.size !== undefined);

        // Convert points to GeoJSON format
        const geojson = {
          type: "FeatureCollection",
          features: points.map((point, index) => {
            const { latitude, longitude, label, color, size, ...otherProps } = point;

            // Set properties based on point data
            const properties: Record<string, any> = {
              name: label || `Point ${index + 1}`,
              id: `point-${index}`,
            };

            // Include the color category if available
            if (color) {
              properties.category = color;
            }

            // Add size if provided
            if (size !== undefined) {
              properties.size = size;
            }

            // Add all other properties from the point
            // Here, we need to use the column info to get friendly names
            Object.entries(otherProps).forEach(([key, value]) => {
              if (value !== undefined && value !== null) {
                // Use the column lookup to get the friendly name
                const displayName = columnLookup[key] || key;
                properties[displayName] = value;
              }
            });

            return {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [longitude, latitude], // GeoJSON format is [lng, lat]
              },
              properties,
            };
          }),
        };

        // Convert your GeoJSON to a File object
        const jsonBlob = new Blob([JSON.stringify(geojson)], { type: "application/geo+json" });
        const geoJsonFile = new File([jsonBlob], "points.geojson", { type: "application/geo+json" });

        // Create initial layer with basic styling
        const layerResult = await felt.createLayersFromGeoJson({
          name: `${title} - Data Points`,
          source: {
            type: "geoJsonFile",
            file: geoJsonFile,
          },
          geometryStyles: {
            Point: {
              paint: {
                color: COLOR_PALETTE[0], // Default color - we'll update this with dynamic styling
                size: 6,
              },
              config: {
                labelAttribute: ["name"],
                /*
                tooltip: [
                  {
                    title: "Name",
                    value: ["get", "name"]
                  },
                  ...(uniqueCategories.length > 0 ? [{
                    title: "Category",
                    value: ["coalesce", ["get", "category"], "None"]
                  }] : [])
                ]
                */
              },
              label: { minZoom: 9 },
            },
          },
        });

        // Apply dynamic styling based on point properties
        if (layerResult && layerResult.layers && layerResult.layers.length > 0) {
          const layer = layerResult.layers[0];

          // Get the current style to extend it
          const currentStyle = { ...layer.style };
          let shouldUpdateStyle = false;

          // Update style for categorical coloring if we have categories
          if (uniqueCategories.length > 0) {
            // Create a match expression that maps each category to its color
            (currentStyle as any).paint = {
              ...(currentStyle as any).paint,
              color: [
                "match",
                ["get", "category"],
                // For each category, specify its color
                ...uniqueCategories.flatMap((category, index) => [
                  category,
                  COLOR_PALETTE[index % COLOR_PALETTE.length],
                ]),
                // Default color for points with no category
                COLOR_PALETTE[0],
              ],
            };
            shouldUpdateStyle = true;
          }

          // Add dynamic sizing if we have size data
          if (hasSizeData) {
            // Find min and max sizes to normalize
            const sizes = points.map((p) => p.size).filter((s): s is number => s !== undefined);

            if (sizes.length > 0) {
              const minSize = Math.min(...sizes);
              const maxSize = Math.max(...sizes);

              // Only apply scaling if we have a range of sizes
              if (minSize !== maxSize) {
                (currentStyle as any).paint = {
                  ...(currentStyle as any).paint,
                  size: [
                    "interpolate",
                    ["linear"],
                    ["get", "size"],
                    minSize,
                    4, // Map minimum size to 4px
                    maxSize,
                    12, // Map maximum size to 12px
                  ],
                };
                shouldUpdateStyle = true;
              }
            }
          }

          // Update the layer style if needed
          if (shouldUpdateStyle) {
            await felt.setLayerStyle({
              id: layer.id,
              style: currentStyle,
            });
          }

          // Get the bounds of all points to fit the viewport
          const pointBounds = calculateBounds(points);
          if (pointBounds) {
            // Fit viewport to the bounds of all points with padding
            await felt.fitViewportToBounds({
              bounds: pointBounds,
            });
          }
        }
      } catch (error) {
        console.error("Error adding points to map:", error);
      }
    }

    if (felt && points.length) {
      // Get all existing layers and delete the ones we created previously
      felt.getLayers().then((layers) => {
        // Filter for layers we likely created
        const ourLayers = layers.filter((layer) => layer && layer.name && layer.name.includes("Data Points"));

        // Delete our previous layers
        Promise.all(ourLayers.map((layer) => layer && felt.deleteLayer(layer.id))).then(() => {
          // After clearing previous layers, add the new ones
          addPointsToMap();
        });
      });
    }
  }, [felt, points, title]);

  // Handle clicking on a point in the sidebar
  const handlePointClick = async (index: number) => {
    if (!felt || !points[index]) return;

    setSelectedPoint(index);

    // Get the point data
    const point = points[index];

    // Set the viewport to focus on this point
    await felt.setViewport({
      center: {
        latitude: point.latitude,
        longitude: point.longitude,
      },
      zoom: 12, // Reasonable zoom level for a single point
    });

    // Attempt to select the feature if possible
    // This would require having the feature ID from the created layer
    // This is a more advanced feature that could be added later
  };

  // Calculate bounds for a set of points
  const calculateBounds = (points: MapPoint[]): [number, number, number, number] | null => {
    if (!points.length) return null;

    // Initialize with the first point
    let minLng = points[0].longitude;
    let minLat = points[0].latitude;
    let maxLng = points[0].longitude;
    let maxLat = points[0].latitude;

    // Find the min/max bounds
    points.forEach((point) => {
      minLng = Math.min(minLng, point.longitude);
      minLat = Math.min(minLat, point.latitude);
      maxLng = Math.max(maxLng, point.longitude);
      maxLat = Math.max(maxLat, point.latitude);
    });

    // Add padding to the bounds (0.1 degrees)
    const padding = 0.1;
    return [minLng - padding, minLat - padding, maxLng + padding, maxLat + padding];
  };

  return (
    <div className="felt-map-component h-full">
      <div className="flex h-full w-full">
        {showSidebar && (
          <div className="w-64 flex-shrink-0 border-r border-border bg-card h-full">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{points.length} data points</p>
            </div>
            <ScrollArea className="h-[calc(100%-65px)]">
              {points.map((point, index) => (
                <div key={index}>
                  <div
                    className={`p-3 hover:bg-muted/50 cursor-pointer transition-colors ${
                      selectedPoint === index ? "bg-muted" : ""
                    }`}
                    onClick={() => handlePointClick(index)}
                  >
                    <div className="font-medium">{point.label || `Point ${index + 1}`}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
                    </div>
                    {point.color && (
                      <div className="flex items-center gap-2 mt-1">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getCategoryColor(point.color) }}
                        />
                        <span className="text-xs">{point.color}</span>
                      </div>
                    )}
                    {point.size !== undefined && (
                      <div className="text-xs text-muted-foreground mt-1">Size: {point.size}</div>
                    )}
                  </div>
                  {index < points.length - 1 && <Separator />}
                </div>
              ))}
            </ScrollArea>
          </div>
        )}

        <div className="relative flex-1 h-full">
          <div ref={mapRef} className="absolute inset-0" />

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-0">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading map...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
