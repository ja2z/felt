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
}

// Extended controller interface to handle missing type definitions
interface ExtendedFeltController extends FeltController {
  destroy?: () => void;
  createLayer?: (options: any) => Promise<any>;
  fitBounds?: (options: any) => Promise<any>;
}

export default function FeltMapComponent({
  mapId,
  title,
  points,
  showSidebar = true,
}: FeltMapComponentProps) {
  const [felt, setFelt] = useState<ExtendedFeltController | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const mapRef = useRef<HTMLDivElement>(null);

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
            fullScreenButton: true,
            showLegend: true,
          },
        };
        
        // Create the Felt map instance
        const feltInstance = await Felt.embed(mapRef.current, mapId, embedOptions);
        setFelt(feltInstance as ExtendedFeltController);
        setIsLoading(false);
      } catch (error) {
        console.error("Error loading Felt map:", error);
        setIsLoading(false);
      }
    }

    loadFelt();
    
    // Cleanup function
    return () => {
      if (felt && typeof felt.destroy === 'function') {
        felt.destroy();
      }
    };
  }, [mapId]);

  // Add points to the map when they change or when the map is ready
  useEffect(() => {
    async function addPointsToMap() {
      if (!felt || !points.length) return;
      
      try {
        // Check if createLayer method exists
        if (typeof felt.createLayer !== 'function') {
          console.error("createLayer method not found on Felt controller");
          return;
        }
        
        // Create a new layer for the points
        const layerName = `Sigma Data Points - ${new Date().toISOString()}`;
        const layer = await felt.createLayer({
          name: layerName,
          type: "POINTS",
        });
        
        // Add each point to the layer
        for (const point of points) {
          const { latitude, longitude, label, size, color } = point;
          
          // Set default style
          const styleOptions: any = {
            radius: size || 5,
          };
          
          // Add color if provided
          if (color) {
            styleOptions.color = color;
          }
          
          // Create the point - check if addPoint exists on layer
          if (layer && typeof layer.addPoint === 'function') {
            await layer.addPoint({
              coordinates: {
                lat: latitude,
                lng: longitude,
              },
              name: label || `Point ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
              style: styleOptions,
            });
          } else {
            console.error("addPoint method not found on layer");
          }
        }
        
        // Zoom to fit all points - check if fitBounds exists
        if (typeof felt.fitBounds === 'function') {
          await felt.fitBounds({
            padding: 50,
          });
        } else {
          console.error("fitBounds method not found on Felt controller");
        }
        
      } catch (error) {
        console.error("Error adding points to map:", error);
      }
    }
    
    if (felt && points.length) {
      addPointsToMap();
    }
  }, [felt, points]);

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
                  <div className="p-3 hover:bg-muted/50 cursor-pointer transition-colors">
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