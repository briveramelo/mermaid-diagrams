import React from 'react';
import { DrawIoEmbed } from 'react-drawio';

interface DrawIoViewerProps {
  xmlData: string;
}

const DrawIoViewer: React.FC<DrawIoViewerProps> = ({ xmlData }) => {
  return (
    <div style={{ width: '100%', height: '500px', border: '1px solid #ccc' }}> {/* Adjust styles as needed */}
      <DrawIoEmbed xml={xmlData} />
    </div>
  );
};

export default DrawIoViewer;
