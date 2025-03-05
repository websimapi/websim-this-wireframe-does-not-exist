const { useState, useEffect, useRef, useMemo, useCallback } = React;
const { createRoot } = ReactDOM;

// Main App component
function App() {
  const [activeTab, setActiveTab] = useState("create");
  const room = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    // Initialize WebsimSocket connection
    room.current = new WebsimSocket();
    
    room.current.onopen = () => {
      setIsConnected(true);
      showToast("Connected to server", "success");
    };
    
    room.current.onclose = () => {
      setIsConnected(false);
      showToast("Connection lost", "error");
    };
    
    return () => {
      room.current.close();
    };
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="container">
      <Header />
      
      <div className="tab-container">
        <ul className="tabs">
          <li 
            className={`tab ${activeTab === "create" ? "active" : ""}`} 
            onClick={() => setActiveTab("create")}
          >
            Create Wireframe
          </li>
          <li 
            className={`tab ${activeTab === "gallery" ? "active" : ""}`} 
            onClick={() => setActiveTab("gallery")}
          >
            Gallery
          </li>
        </ul>
        
        {activeTab === "create" ? (
          <WireframeGenerator room={room.current} showToast={showToast} />
        ) : (
          <WireframeGallery room={room.current} />
        )}
      </div>
      
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <header>
      <h1>This Wireframe Does Not Exist</h1>
      <p className="subheading">
        Generate AI-powered wireframes for your next project
      </p>
    </header>
  );
}

function WireframeGenerator({ room, showToast }) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("minimal");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDescription, setGeneratedDescription] = useState("");
  const [generatingStage, setGeneratingStage] = useState("idle"); // idle, description, image

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!prompt.trim()) {
      showToast("Please enter a prompt", "error");
      return;
    }
    
    if (!room) {
      showToast("Connection not established", "error");
      return;
    }
    
    try {
      setIsGenerating(true);
      setGeneratingStage("description");
      
      // Step 1: Generate detailed wireframe description using LLM
      const descriptionCompletion = await websim.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are a UI/UX design expert specializing in detailed wireframe descriptions.
            Given a prompt for a user interface, create a highly detailed description of a wireframe.
            Include specific layout information, component descriptions, colors, spacing, animations and interactions.
            The description should be thorough enough that it could be used to generate a visual wireframe image.
            Focus on being practical and realistic for modern web/mobile interfaces.`
          },
          {
            role: "user",
            content: `Create a detailed wireframe description for: ${prompt}. 
            Style preference: ${style}. 
            Be extremely specific about the layout, components, colors, and interactions.`
          }
        ]
      });
      
      const wireframeDescription = descriptionCompletion.content;
      setGeneratedDescription(wireframeDescription);
      
      // Step 2: Generate wireframe image based on the description
      setGeneratingStage("image");
      const imageResult = await websim.imageGen({
        prompt: `UI/UX wireframe design for: ${prompt}. ${wireframeDescription}. 
                Style: ${style}. Clean, professional wireframe with attention to detail. 
                High quality UI/UX mockup with clear components.`,
        aspect_ratio: "16:9",
      });
      
      // Step 3: Save the wireframe to database
      await room.collection('wireframes').create({
        prompt,
        style,
        description: wireframeDescription,
        imageUrl: imageResult.url,
      });
      
      showToast("Wireframe generated successfully!", "success");
      setPrompt("");
      setGeneratedDescription("");
      
    } catch (error) {
      console.error("Error generating wireframe:", error);
      showToast("Error generating wireframe. Please try again.", "error");
    } finally {
      setIsGenerating(false);
      setGeneratingStage("idle");
    }
  };

  return (
    <div className="generator-form">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="prompt">Describe the interface you want to generate</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., A mobile app dashboard for tracking daily water intake with progress visualization"
            disabled={isGenerating}
            required
          />
          <div className="input-hint">
            Be specific about the type of interface, purpose, and key features
          </div>
        </div>
        
        <div className="form-group">
          <label htmlFor="style">Style Preference</label>
          <select
            id="style"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            disabled={isGenerating}
          >
            <option value="minimal">Minimal</option>
            <option value="modern">Modern</option>
            <option value="material">Material Design</option>
            <option value="neumorphic">Neumorphic</option>
            <option value="dark">Dark Mode</option>
            <option value="colorful">Colorful</option>
          </select>
        </div>
        
        <button type="submit" disabled={isGenerating || !prompt.trim()}>
          {isGenerating ? 
            `Generating ${generatingStage === "description" ? "Description" : "Image"}...` : 
            "Generate Wireframe"}
        </button>
      </form>
      
      {isGenerating && (
        <div className="loading-indicator">
          <div className="spinner"></div>
        </div>
      )}
      
      {generatedDescription && (
        <div className="generated-description">
          <h3>Generated Description:</h3>
          <p>{generatedDescription}</p>
        </div>
      )}
    </div>
  );
}

function WireframeGallery({ room }) {
  const [selectedWireframe, setSelectedWireframe] = useState(null);
  const wireframes = React.useSyncExternalStore(
    room?.collection('wireframes').subscribe || (() => {}),
    () => room?.collection('wireframes').getList() || []
  );

  // Sort wireframes by creation date (newest first)
  const sortedWireframes = useMemo(() => {
    return [...wireframes].sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    );
  }, [wireframes]);

  return (
    <div>
      <div className="gallery">
        {sortedWireframes.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "2rem" }}>
            No wireframes generated yet. Be the first to create one!
          </div>
        ) : (
          sortedWireframes.map(wireframe => (
            <WireframeCard 
              key={wireframe.id} 
              wireframe={wireframe} 
              onClick={() => setSelectedWireframe(wireframe)} 
            />
          ))
        )}
      </div>
      
      {selectedWireframe && (
        <WireframeModal 
          wireframe={selectedWireframe} 
          onClose={() => setSelectedWireframe(null)} 
        />
      )}
    </div>
  );
}

function WireframeCard({ wireframe, onClick }) {
  return (
    <div className="wireframe-card" onClick={onClick}>
      <img 
        src={wireframe.imageUrl} 
        alt={wireframe.prompt} 
        className="wireframe-image" 
        loading="lazy"
      />
      <div className="wireframe-content">
        <h3 className="wireframe-title">
          {wireframe.prompt.length > 50 ? 
            wireframe.prompt.substring(0, 50) + '...' : 
            wireframe.prompt}
        </h3>
        <div className="wireframe-meta">
          <div className="user-info">
            <img 
              src={`https://images.websim.ai/avatar/${wireframe.username}`} 
              alt={wireframe.username} 
              className="user-avatar" 
            />
            <span>{wireframe.username}</span>
          </div>
          <div className="timestamp">
            {new Date(wireframe.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}

function WireframeModal({ wireframe, onClose }) {
  // Close when ESC key is pressed
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{wireframe.prompt}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <img 
            src={wireframe.imageUrl} 
            alt={wireframe.prompt} 
            className="modal-image" 
          />
          <div className="modal-description">
            <strong>Description:</strong>
            <p>{wireframe.description}</p>
          </div>
          <div className="modal-details">
            <div><strong>Style:</strong> {wireframe.style}</div>
          </div>
        </div>
        <div className="modal-footer">
          <div className="user-info">
            <img 
              src={`https://images.websim.ai/avatar/${wireframe.username}`} 
              alt={wireframe.username} 
              className="user-avatar" 
            />
            <span>Created by {wireframe.username}</span>
          </div>
          <div>
            {new Date(wireframe.created_at).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

// Initialize React
const root = createRoot(document.getElementById('root'));
root.render(<App />);

