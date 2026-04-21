import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '@/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarLabelStyle: styles.tabLabel,
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="circles"
        options={{
          title: 'circles',
          tabBarIcon: ({ color }: { color: string }) => (
            <View style={[styles.dot, { borderColor: color }]} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'you',
          tabBarIcon: ({ color }: { color: string }) => (
            <View style={[styles.dotSolid, { backgroundColor: color }]} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bg,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 72,
    paddingTop: 8,
  },
  tabLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    marginTop: 2,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  dotSolid: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});
