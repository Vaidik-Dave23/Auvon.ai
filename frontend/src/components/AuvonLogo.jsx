function AuvonLogo({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="auvon-g1" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#7F77DD" />
          <stop offset="100%" stopColor="#1D9E75" />
        </linearGradient>

        <style>{`
          .auvon-left {
            stroke-dasharray: 160;
            stroke-dashoffset: 160;
            animation: auvon-draw 0.7s cubic-bezier(0.4,0,0.2,1) 0.1s forwards;
          }
          .auvon-right {
            stroke-dasharray: 160;
            stroke-dashoffset: 160;
            animation: auvon-draw 0.7s cubic-bezier(0.4,0,0.2,1) 0.3s forwards;
          }
          .auvon-cross {
            stroke-dasharray: 100;
            stroke-dashoffset: 100;
            animation: auvon-draw 0.4s ease-out 0.8s forwards;
          }
          .auvon-arc {
            stroke-dasharray: 60;
            stroke-dashoffset: 60;
            animation: auvon-draw 0.4s ease-out 1.0s forwards;
          }
          .auvon-node {
            opacity: 0;
            animation: auvon-pop 0.3s ease-out forwards;
          }
          .auvon-node-apex  { animation-delay: 1.1s; }
          .auvon-node-bl    { animation-delay: 0.9s; }
          .auvon-node-br    { animation-delay: 0.9s; }
          .auvon-node-cl    { animation-delay: 0.85s; }
          .auvon-node-cr    { animation-delay: 0.85s; }
          .auvon-branch-l {
            stroke-dasharray: 40;
            stroke-dashoffset: 40;
            animation: auvon-draw 0.3s ease-out 0.95s forwards;
          }
          .auvon-branch-r {
            stroke-dasharray: 40;
            stroke-dashoffset: 40;
            animation: auvon-draw 0.3s ease-out 0.95s forwards;
          }
          .auvon-node-bl2 { animation-delay: 1.05s; }
          .auvon-node-br2 { animation-delay: 1.05s; }
          .auvon-wordmark {
            opacity: 0;
            animation: auvon-fade 0.6s ease-out 1.2s forwards;
          }
          .auvon-dot {
            opacity: 0;
            animation: auvon-fade 0.5s ease-out 1.5s forwards;
          }
          .auvon-pulse {
            animation: auvon-pulse 2.5s ease-in-out 1.8s infinite;
          }
          @keyframes auvon-draw {
            to { stroke-dashoffset: 0; }
          }
          @keyframes auvon-pop {
            0%   { opacity: 0; transform: scale(0); }
            60%  { opacity: 1; transform: scale(1.3); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes auvon-fade {
            to { opacity: 1; }
          }
          @keyframes auvon-pulse {
            0%, 100% { opacity: 1;   r: 7; }
            50%       { opacity: 0.5; r: 9; }
          }
        `}</style>
      </defs>

      {/* Left stroke of A */}
      <line
        className="auvon-left"
        x1="60" y1="170" x2="100" y2="40"
        stroke="url(#auvon-g1)" strokeWidth="7" strokeLinecap="round"
      />
      {/* Right stroke of A */}
      <line
        className="auvon-right"
        x1="140" y1="170" x2="100" y2="40"
        stroke="url(#auvon-g1)" strokeWidth="7" strokeLinecap="round"
      />
      {/* Crossbar */}
      <line
        className="auvon-cross"
        x1="76" y1="122" x2="124" y2="122"
        stroke="#5DCAA5" strokeWidth="4" strokeLinecap="round"
      />
      {/* Neural arc above apex */}
      <path
        className="auvon-arc"
        d="M 82 52 Q 100 28 118 52"
        stroke="#5DCAA5" strokeWidth="3" strokeLinecap="round"
      />

      {/* Branch lines off crossbar */}
      <line className="auvon-branch-l" x1="76" y1="122" x2="58" y2="106" stroke="#5DCAA5" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
      <line className="auvon-branch-r" x1="124" y1="122" x2="142" y2="106" stroke="#5DCAA5" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>

      {/* Nodes */}
      <circle className="auvon-node auvon-node-apex auvon-pulse" cx="100" cy="40" r="7" fill="#5DCAA5" style={{transformOrigin:'100px 40px'}}/>
      <circle className="auvon-node auvon-node-bl"  cx="60"  cy="170" r="5.5" fill="#534AB7" style={{transformOrigin:'60px 170px'}}/>
      <circle className="auvon-node auvon-node-br"  cx="140" cy="170" r="5.5" fill="#534AB7" style={{transformOrigin:'140px 170px'}}/>
      <circle className="auvon-node auvon-node-cl"  cx="76"  cy="122" r="3.5" fill="white"   style={{transformOrigin:'76px 122px', opacity:0}}/>
      <circle className="auvon-node auvon-node-cr"  cx="124" cy="122" r="3.5" fill="white"   style={{transformOrigin:'124px 122px', opacity:0}}/>
      <circle className="auvon-node auvon-node-bl2" cx="58"  cy="106" r="3"   fill="#5DCAA5" style={{transformOrigin:'58px 106px', opacity:0}}/>
      <circle className="auvon-node auvon-node-br2" cx="142" cy="106" r="3"   fill="#5DCAA5" style={{transformOrigin:'142px 106px', opacity:0}}/>

      {/* Wordmark */}
      <text
        className="auvon-wordmark"
        x="100" y="200"
        fontFamily="'Palatino Linotype', Palatino, 'Book Antiqua', serif"
        fontSize="28" fontWeight="700" letterSpacing="5"
        fill="white" textAnchor="middle"
      >
        AUVON
      </text>
      <text
        className="auvon-dot"
        x="100" y="218"
        fontFamily="'Palatino Linotype', Palatino, 'Book Antiqua', serif"
        fontSize="13" letterSpacing="6"
        fill="#5DCAA5" textAnchor="middle"
      >
        .ai
      </text>
    </svg>
  );
}

export default AuvonLogo;
