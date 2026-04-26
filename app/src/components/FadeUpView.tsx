import { ReactNode, useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';

import { motion } from '../theme/tokens';

interface FadeUpViewProps {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

export function FadeUpView({ children, delay = 0, style }: FadeUpViewProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: motion.duration,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: motion.spring.damping,
          stiffness: motion.spring.stiffness,
          mass: motion.spring.mass,
          useNativeDriver: true,
        }),
      ]),
    ]);

    animation.start();
    return () => {
      animation.stop();
    };
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
