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
}

export default function FeltMapComponent({
  mapId,
  title,
  points,
  showSidebar = true,
  showLegend = false,
}: FeltMapComponentProps) {
  const [felt, setFelt] = useState<FeltController | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);

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
  }, [mapId]);

  // Convert points to GeoJSON and add to map when they change or when the map is ready
  useEffect(() => {
    async function addPointsToMap() {
      if (!felt || !points.length) return;
      
      try {
        // Convert points to GeoJSON format
        const geojson = {
          type: "FeatureCollection",
          features: points.map((point, index) => {
            const { latitude, longitude, label, color } = point;
            
            // Set properties based on point data
            const properties: Record<string, any> = {
              name: label || `Point ${index + 1}`,
              id: `point-${index}`,
            };
            
            // Add color if provided
            if (color) {
              properties.color = color;
            }
            
            // Add size if provided
            if (point.size !== undefined) {
              properties.size = point.size;
            }
            
            return {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [longitude, latitude], // GeoJSON format is [lng, lat]
              },
              properties
            };
          })
        };
        
// Convert your GeoJSON to a File object
const jsonBlob = new Blob([JSON.stringify(geojson)], { type: "application/geo+json" });
const geoJsonFile = new File([jsonBlob], "points.geojson", { type: "application/geo+json" });

const layerResult = await felt.createLayersFromGeoJson({
  name: `${title} - Data Points`,
  source: {
    type: "geoJsonFile",
    file: geoJsonFile,
  },
  geometryStyles: {
    Point: {
      paint: { 
        color: "#4c78a8",
        size: 6,
      },
      config: { labelAttribute: ["name"] },
      label: { minZoom: 0 },
    }
  }
});

        if (layerResult) {
          // Get the bounds of all points to fit the viewport
          const pointBounds = calculateBounds(points);
          if (pointBounds) {
            // Fit viewport to the bounds of all points with padding
            await felt.fitViewportToBounds({
              bounds: pointBounds
            });
          }
        }
      } catch (error) {
        console.error("Error adding points to map:", error);
      }
    }
    
    if (felt && points.length) {
      // Get all existing layers and delete the ones we created previously
      felt.getLayers().then(layers => {
        // Filter for layers we likely created
        const ourLayers = layers.filter(layer => 
          layer && layer.name && layer.name.includes('Data Points')
        );
        
        // Delete our previous layers
        Promise.all(
          ourLayers.map(layer => 
            layer && felt.deleteLayer(layer.id)
          )
        ).then(() => {
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
        longitude: point.longitude
      },
      zoom: 12 // Reasonable zoom level for a single point
    });
    
    // TODO: Select the feature if possible
    // This would require tracking the layer ID and feature ID
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
    points.forEach(point => {
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
              <p className="text-sm text-muted-foreground">
                {points.length} data points
              </p>
            </div>
            <ScrollArea className="h-[calc(100%-65px)]">
              {points.map((point, index) => (
                <div key={index}>
                  <div 
                    className={`p-3 hover:bg-muted/50 cursor-pointer transition-colors ${
                      selectedPoint === index ? 'bg-muted' : ''
                    }`}
                    onClick={() => handlePointClick(index)}
                  >
                    <div className="font-medium">
                      {point.label || `Point ${index + 1}`}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
                    </div>
                  </div>
                  {index < points.length - 1 && <Separator />}
                </div>
              ))}
            </ScrollArea>
          </div>
        )}

        <div className="relative flex-1 h-full">
          <div 
            ref={mapRef} 
            className="absolute inset-0"
          />
          
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-0">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">
                  Loading map...
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}