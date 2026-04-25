import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from "@react-email/components";

interface NewUserNotificationProps {
  userName?: string;
  userEmail?: string;
}

const baseUrl = `https://serial.tube`;

export default function NewUserNotificationEmail({
  userName,
  userEmail,
}: NewUserNotificationProps) {
  return (
    <Html>
      <Head />
      <Preview>
        New user signed up: {userName ?? userEmail ?? "Unknown"}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>New User Signed Up</Heading>
          <Text style={text}>
            A new user has created an account on your Serial instance.
          </Text>
          <Text style={text}>
            <strong>Name:</strong> {userName ?? "Not provided"}
            <br />
            <strong>Email:</strong> {userEmail ?? "Not provided"}
          </Text>

          <Img
            style={{
              marginTop: 32,
            }}
            src={`${baseUrl}/icon-256.png`}
            width="48"
            height="48"
            alt="Serial's Logo"
          />
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#ffffff",
};

const container = {
  paddingLeft: "12px",
  paddingRight: "12px",
  margin: "0 auto",
} as const;

const h1 = {
  color: "#333",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: "24px",
  fontWeight: "bold",
  marginTop: "40px",
  marginBottom: "20px",
  padding: "0",
};

const text = {
  color: "#333",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: "14px",
  margin: "24px 0",
};
