"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.glowCard = exports.hoverScale = exports.modalAnimation = exports.listItem = exports.pageTransition = exports.pulse = exports.staggerContainer = exports.scaleUp = exports.fadeInRight = exports.fadeInLeft = exports.fadeInDown = exports.fadeInUp = void 0;
// Fade-in animation from bottom to top
exports.fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1]
        }
    },
    exit: {
        opacity: 0,
        y: 20,
        transition: {
            duration: 0.3,
            ease: [0.22, 1, 0.36, 1]
        }
    }
};
// Fade-in animation from top to bottom
exports.fadeInDown = {
    hidden: { opacity: 0, y: -20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1]
        }
    },
    exit: {
        opacity: 0,
        y: -20,
        transition: {
            duration: 0.3,
            ease: [0.22, 1, 0.36, 1]
        }
    }
};
// Fade-in from left to right
exports.fadeInLeft = {
    hidden: { opacity: 0, x: -20 },
    visible: {
        opacity: 1,
        x: 0,
        transition: {
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1]
        }
    },
    exit: {
        opacity: 0,
        x: -20,
        transition: {
            duration: 0.3,
            ease: [0.22, 1, 0.36, 1]
        }
    }
};
// Fade-in from right to left
exports.fadeInRight = {
    hidden: { opacity: 0, x: 20 },
    visible: {
        opacity: 1,
        x: 0,
        transition: {
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1]
        }
    },
    exit: {
        opacity: 0,
        x: 20,
        transition: {
            duration: 0.3,
            ease: [0.22, 1, 0.36, 1]
        }
    }
};
// Scale animation for cards and buttons
exports.scaleUp = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
        opacity: 1,
        scale: 1,
        transition: {
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1]
        }
    },
    exit: {
        opacity: 0,
        scale: 0.9,
        transition: {
            duration: 0.3,
            ease: [0.22, 1, 0.36, 1]
        }
    }
};
// Stagger children animation
exports.staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.1
        }
    },
    exit: {
        opacity: 0,
        transition: {
            staggerChildren: 0.05,
            staggerDirection: -1
        }
    }
};
// Pulse animation for highlighting elements
exports.pulse = {
    hidden: { opacity: 0.8, scale: 1 },
    visible: {
        opacity: 1,
        scale: [1, 1.05, 1],
        transition: {
            duration: 1.5,
            ease: "easeInOut",
            repeat: Infinity,
            repeatType: "reverse"
        }
    }
};
// Animation for page transitions
exports.pageTransition = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            duration: 0.5,
            when: "beforeChildren",
            staggerChildren: 0.1
        }
    },
    exit: {
        opacity: 0,
        transition: {
            duration: 0.3,
            when: "afterChildren",
            staggerChildren: 0.05,
            staggerDirection: -1
        }
    }
};
// Animation for list items
exports.listItem = {
    hidden: { opacity: 0, y: 10 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.3
        }
    },
    exit: {
        opacity: 0,
        y: 10,
        transition: {
            duration: 0.2
        }
    }
};
// Animation for modals and dialogs
exports.modalAnimation = {
    hidden: { opacity: 0, scale: 0.95, y: 10 },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: {
            type: "spring",
            damping: 20,
            stiffness: 300
        }
    },
    exit: {
        opacity: 0,
        scale: 0.95,
        y: 10,
        transition: {
            duration: 0.2
        }
    }
};
// Animation for hover effects (disabled)
exports.hoverScale = {
    scale: 1,
    transition: {
        duration: 0
    }
};
// Animation for cards with neon glow effect
exports.glowCard = {
    hidden: { opacity: 0, y: 20, boxShadow: '0 0 0px rgba(108, 99, 255, 0)' },
    visible: {
        opacity: 1,
        y: 0,
        boxShadow: '0 0 15px rgba(108, 99, 255, 0.3)',
        transition: {
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1]
        }
    },
    hover: {
        y: 0,
        boxShadow: '0 0 15px rgba(108, 99, 255, 0.3)',
        transition: {
            duration: 0,
            ease: "easeOut"
        }
    }
};
