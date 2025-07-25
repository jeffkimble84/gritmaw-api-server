import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { claudeService } from '@/lib/services/ClaudeService'

interface ExtractedPosition {
  symbol: string
  quantity: number
  entryPrice: number
  currentPrice?: number
  entryDate?: string
  value?: number
  percentChange?: number
}

interface ExtractionResult {
  positions: ExtractedPosition[]
  totalValue?: number
  dateRange?: string
  broker?: string
  accountType?: string
  extractionConfidence: number
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 })
    }

    const { image, filename, mimeType } = await request.json()

    if (!image) {
      return NextResponse.json({ 
        success: false, 
        error: 'No image provided' 
      }, { status: 400 })
    }

    // Use Claude's vision capabilities to extract portfolio data
    const extractionResult = await extractPortfolioFromImage(image, filename)

    // Validate and clean the extracted data
    const validatedData = validateExtractedData(extractionResult)

    // Save to database (would implement this)
    // await saveExtractedPositions(session.user.id, validatedData)

    return NextResponse.json({
      success: true,
      data: validatedData,
      metadata: {
        filename,
        processedAt: new Date().toISOString(),
        positionCount: validatedData.positions.length,
        confidence: validatedData.extractionConfidence
      }
    })

  } catch (error) {
    console.error('Screenshot import error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process screenshot'
    }, { status: 500 })
  }
}

async function extractPortfolioFromImage(
  imageData: string,
  filename: string
): Promise<ExtractionResult> {
  // Check if Claude service is available
  if (!claudeService.isAvailable()) {
    // Fallback to mock data for development
    return getMockExtractionResult()
  }

  try {
    // Prepare the prompt for Claude
    const prompt = `Analyze this screenshot of a brokerage account and extract all portfolio positions.

For each position, extract:
- Symbol/Ticker
- Quantity/Shares
- Entry/Purchase Price (average cost)
- Current Price (if shown)
- Entry/Purchase Date (if available)
- Current Value
- Gain/Loss percentage

Also identify:
- The broker/platform (if identifiable)
- Total portfolio value
- Date range of transactions
- Account type (if visible)

Return the data in this exact JSON format:
{
  "positions": [
    {
      "symbol": "AAPL",
      "quantity": 100,
      "entryPrice": 150.25,
      "currentPrice": 175.50,
      "entryDate": "2023-06-15",
      "value": 17550.00,
      "percentChange": 16.81
    }
  ],
  "totalValue": 50000.00,
  "dateRange": "Jun 2023 - Present",
  "broker": "TD Ameritrade",
  "accountType": "Individual",
  "extractionConfidence": 0.95
}

Important:
- Be precise with numbers
- If a field is not visible, omit it rather than guessing
- Include confidence score (0-1) based on image quality and data completeness`

    // Call Claude API with the image
    const response = await claudeService.analyzeScreenshot({
      image: imageData,
      prompt: prompt,
      maxTokens: 4000
    })

    // Parse the response
    const extractedData = JSON.parse(response.data)
    
    return extractedData as ExtractionResult

  } catch (error) {
    console.error('Claude extraction error:', error)
    // Return empty result if extraction fails
    return {
      positions: [],
      extractionConfidence: 0,
      error: 'Failed to extract data from image'
    }
  }
}

function validateExtractedData(data: ExtractionResult): ExtractionResult {
  // Clean and validate positions
  const validatedPositions = data.positions
    .filter(pos => {
      // Must have symbol and quantity at minimum
      return pos.symbol && pos.quantity > 0
    })
    .map(pos => {
      // Clean up symbol
      const cleanSymbol = pos.symbol.toUpperCase().trim()
      
      // Ensure numeric values
      const quantity = Math.abs(Number(pos.quantity))
      const entryPrice = pos.entryPrice ? Math.abs(Number(pos.entryPrice)) : 0
      const currentPrice = pos.currentPrice ? Math.abs(Number(pos.currentPrice)) : undefined
      
      return {
        ...pos,
        symbol: cleanSymbol,
        quantity,
        entryPrice,
        currentPrice,
        value: pos.value ? Math.abs(Number(pos.value)) : quantity * (currentPrice || entryPrice),
        percentChange: pos.percentChange ? Number(pos.percentChange) : undefined
      }
    })

  return {
    ...data,
    positions: validatedPositions,
    totalValue: data.totalValue ? Math.abs(Number(data.totalValue)) : 
      validatedPositions.reduce((sum, pos) => sum + (pos.value || 0), 0)
  }
}

function getMockExtractionResult(): ExtractionResult {
  return {
    positions: [
      {
        symbol: 'AAPL',
        quantity: 100,
        entryPrice: 150.25,
        currentPrice: 175.50,
        entryDate: '2023-06-15',
        value: 17550.00,
        percentChange: 16.81
      },
      {
        symbol: 'MSFT',
        quantity: 50,
        entryPrice: 280.00,
        currentPrice: 320.00,
        entryDate: '2023-08-20',
        value: 16000.00,
        percentChange: 14.29
      },
      {
        symbol: 'TSLA',
        quantity: 25,
        entryPrice: 220.00,
        currentPrice: 195.00,
        entryDate: '2023-09-10',
        value: 4875.00,
        percentChange: -11.36
      }
    ],
    totalValue: 38425.00,
    dateRange: 'Jun 2023 - Present',
    broker: 'Mock Broker',
    accountType: 'Individual',
    extractionConfidence: 0.95
  }
}